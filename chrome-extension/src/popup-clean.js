// Modern Popup JavaScript for Fum Calendar Extension
class FumCalendarModernPopup {
    constructor() {
        this.courses = [];
        this.isLoading = false;
        this.currentProgress = 0;
        this.settings = {
            autoDetailExtract: true,
            includeOddEven: true,
            academicYear: '1404-1405'
        };
        this.init();
    }

    async init() {
        console.log('Initializing Fum Calendar Modern Popup...');
        
        // Load saved data
        await this.loadData();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Update UI
        this.updateUI();
        
        // Setup settings
        this.loadSettings();
    }

    setupEventListeners() {
        // Main action buttons
        document.getElementById('autoExtractBtn').addEventListener('click', () => this.autoExtractCourses());
        document.getElementById('manualExtractBtn').addEventListener('click', () => this.manualExtractCourses());
        
        // Control buttons
        document.getElementById('refreshBtn').addEventListener('click', () => this.refreshData());
        document.getElementById('clearBtn').addEventListener('click', () => this.clearAllCourses());
        
        // Export buttons
        document.getElementById('exportGoogleBtn').addEventListener('click', () => this.exportToGoogle());
        document.getElementById('exportICSBtn').addEventListener('click', () => this.exportToICS());
        document.getElementById('exportJSONBtn').addEventListener('click', () => this.exportToJSON());
        
        // Settings toggle
        document.getElementById('settingsToggle').addEventListener('click', () => this.toggleSettings());
        
        // Settings inputs
        document.getElementById('autoDetailExtract').addEventListener('change', (e) => {
            this.settings.autoDetailExtract = e.target.checked;
            this.saveSettings();
        });
        
        document.getElementById('includeOddEven').addEventListener('change', (e) => {
            this.settings.includeOddEven = e.target.checked;
            this.saveSettings();
        });
        
        document.getElementById('academicYear').addEventListener('change', (e) => {
            this.settings.academicYear = e.target.value;
            this.saveSettings();
        });
    }

    async loadData() {
        try {
            const result = await chrome.storage.local.get(['fumCourses', 'fumSettings']);
            this.courses = result.fumCourses || [];
            this.settings = { ...this.settings, ...(result.fumSettings || {}) };
        } catch (error) {
            console.error('Error loading data:', error);
        }
    }

    async saveData() {
        try {
            await chrome.storage.local.set({ 
                fumCourses: this.courses,
                fumSettings: this.settings 
            });
        } catch (error) {
            console.error('Error saving data:', error);
        }
    }

    loadSettings() {
        document.getElementById('autoDetailExtract').checked = this.settings.autoDetailExtract;
        document.getElementById('includeOddEven').checked = this.settings.includeOddEven;
        document.getElementById('academicYear').value = this.settings.academicYear;
    }

    async saveSettings() {
        await chrome.storage.local.set({ fumSettings: this.settings });
    }

    async autoExtractCourses() {
        if (this.isLoading) return;
        
        try {
            this.setLoadingState(true);
            this.updateStatus('در حال استخراج هوشمند...', 'info');
            this.showProgress('شروع استخراج هوشمند دروس...', 10);
            
            // Get active tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) {
                throw new Error('تب فعال یافت نشد');
            }

            this.showProgress('بررسی صفحه فعال...', 15);
            
            // Check if we need to navigate to portal
            if (!tab.url.includes('pooya.um.ac.ir')) {
                this.showProgress('انتقال به پرتال دانشگاه...', 20);
                await chrome.tabs.update(tab.id, { 
                    url: 'https://pooya.um.ac.ir/educ/educfac/ShowStSchedule.php' 
                });
                
                // Wait for navigation
                await this.waitForNavigation(tab.id, 'ShowStSchedule.php');
                this.showProgress('صفحه بارگذاری شد', 35);
                
                // Wait a bit more for content script to load
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
            
            this.showProgress('تزریق content script...', 40);
            
            // Ensure content script is injected
            try {
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['src/content.js']
                });
                this.showProgress('content script آماده شد', 45);
            } catch (scriptError) {
                console.log('Content script may already be loaded:', scriptError.message);
            }
            
            // Wait for content script to be ready
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            this.showProgress('استخراج دروس از برنامه هفتگی...', 50);
            
            // Test if content script is responding
            let testResponse;
            try {
                testResponse = await Promise.race([
                    chrome.tabs.sendMessage(tab.id, { action: 'getCourses' }),
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('تست ارتباط منقضی شد')), 5000)
                    )
                ]);
                this.showProgress('ارتباط با صفحه برقرار شد', 60);
            } catch (testError) {
                console.error('Content script test failed:', testError);
                throw new Error('امکان برقراری ارتباط با صفحه وجود ندارد. لطفاً صفحه را بازخوانی کنید.');
            }
            
            // Extract courses with details using a timeout to prevent hanging
            const response = await Promise.race([
                chrome.tabs.sendMessage(tab.id, { action: 'autoExtractWithDetails' }),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('عملیات استخراج منقضی شد')), 25000)
                )
            ]);
            
            this.showProgress('پردازش داده‌ها...', 80);
            
            if (response && response.success && response.courses) {
                this.courses = response.courses;
                this.showProgress('ذخیره اطلاعات...', 90);
                await this.saveData();
                this.showProgress('تکمیل شد!', 100);
                
                this.showNotification(
                    `${this.courses.length} درس با موفقیت استخراج شد!`, 
                    'success'
                );
            } else {
                throw new Error(response?.error || 'پاسخ نامعتبر از content script');
            }
            
        } catch (error) {
            console.error('Auto extraction error:', error);
            let errorMsg = error.message;
            
            // Handle specific error types
            if (errorMsg.includes('message channel closed')) {
                errorMsg = 'ارتباط با صفحه قطع شد. لطفاً صفحه را بازخوانی کرده و دوباره تلاش کنید.';
            } else if (errorMsg.includes('Could not establish connection')) {
                errorMsg = 'امکان برقراری ارتباط با صفحه وجود ندارد. آیا در صفحه پرتال دانشگاه فردوسی هستید؟';
            } else if (errorMsg.includes('منقضی شد')) {
                errorMsg = 'عملیات خیلی طول کشید. لطفاً اتصال اینترنت را بررسی کنید.';
            } else if (errorMsg.includes('بازخوانی کنید')) {
                // Already a good error message
            } else {
                errorMsg = 'خطای غیرمنتظره: ' + errorMsg;
            }
            
            this.showNotification('خطا در استخراج: ' + errorMsg, 'error');
        } finally {
            this.setLoadingState(false);
            this.hideProgress();
            this.updateUI();
        }
    }

    async manualExtractCourses() {
        if (this.isLoading) return;
        
        try {
            this.setLoadingState(true);
            this.updateStatus('در حال استخراج...', 'info');
            
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) {
                throw new Error('تب فعال یافت نشد');
            }
            
            const response = await Promise.race([
                chrome.tabs.sendMessage(tab.id, { action: 'extractCourses' }),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('عملیات استخراج منقضی شد')), 15000)
                )
            ]);
            
            if (response && response.success && response.courses) {
                this.courses = response.courses;
                await this.saveData();
                this.showNotification(`${this.courses.length} درس استخراج شد`, 'success');
            } else if (response && response.courses && response.courses.length === 0) {
                this.showNotification('هیچ درسی یافت نشد', 'warning');
            } else {
                throw new Error(response?.error || 'پاسخ نامعتبر از content script');
            }
            
        } catch (error) {
            console.error('Manual extraction error:', error);
            let errorMsg = error.message;
            
            if (errorMsg.includes('message channel closed')) {
                errorMsg = 'ارتباط با صفحه قطع شد. لطفاً صفحه را بازخوانی کنید';
            } else if (errorMsg.includes('Could not establish connection')) {
                errorMsg = 'امکان برقراری ارتباط با صفحه وجود ندارد. صفحه پرتال باز است؟';
            }
            
            this.showNotification('خطا در استخراج: ' + errorMsg, 'error');
        } finally {
            this.setLoadingState(false);
            this.updateUI();
        }
    }

    async refreshData() {
        this.updateStatus('به‌روزرسانی...', 'info');
        await this.loadData();
        this.updateUI();
        this.showNotification('داده‌ها به‌روزرسانی شد', 'success');
    }

    async clearAllCourses() {
        if (confirm('آیا از پاک کردن تمام دروس اطمینان دارید؟')) {
            this.courses = [];
            await this.saveData();
            this.updateUI();
            this.showNotification('تمام دروس پاک شد', 'success');
        }
    }

    updateUI() {
        this.updateCourseCount();
        this.renderCoursesList();
        this.updateStatus();
        this.toggleExportSection();
    }

    updateCourseCount() {
        const countElement = document.getElementById('courseCount');
        countElement.textContent = this.courses.length;
        
        // Update course count badge
        countElement.classList.toggle('pulse', this.courses.length > 0);
    }

    renderCoursesList() {
        const listElement = document.getElementById('coursesList');
        const emptyState = document.getElementById('emptyState');
        
        if (this.courses.length === 0) {
            if (emptyState) {
                emptyState.style.display = 'block';
            }
            listElement.innerHTML = '<div class="empty-state"><i class="fas fa-graduation-cap"></i><p>هیچ درسی استخراج نشده است</p><small>از دکمه \"استخراج هوشمند\" استفاده کنید</small></div>';
            return;
        }
        
        if (emptyState) {
            emptyState.style.display = 'none';
        }
        listElement.innerHTML = '';
        
        console.log('Rendering courses:', this.courses.length);
        
        this.courses.forEach((course, index) => {
            const courseElement = this.createCourseElement(course, index);
            listElement.appendChild(courseElement);
        });
    }

    createCourseElement(course, index) {
        const courseDiv = document.createElement('div');
        courseDiv.className = 'course-item';
        
        const hasDetails = course.courseDetails && Object.keys(course.courseDetails).some(key => course.courseDetails[key]);
        const detailStatus = hasDetails ? 'موجود' : 'نیاز به استخراج';
        const detailIcon = hasDetails ? 'fas fa-check-circle' : 'fas fa-download';
        const detailClass = hasDetails ? 'success' : 'warning';
        
        courseDiv.innerHTML = `
            <div class="course-info">
                <div class="course-name">${course.name || course.courseName || 'نام درس نامشخص'}</div>
                <div class="course-teacher">${course.teacher || 'استاد نامشخص'}</div>
                <div class="course-details">
                    <div class="course-detail">
                        <i class="fas fa-clock"></i>
                        ${course.day || ''} ${course.time || ''}
                    </div>
                    <div class="course-detail">
                        <i class="fas fa-map-marker-alt"></i>
                        ${course.location || 'مکان نامشخص'}
                    </div>
                    ${course.credits ? `
                    <div class="course-detail">
                        <i class="fas fa-graduation-cap"></i>
                        ${course.credits} واحد
                    </div>
                    ` : ''}
                    ${course.isOddWeek || course.isEvenWeek ? `
                    <div class="course-detail">
                        <i class="fas fa-calendar-week"></i>
                        ${course.isOddWeek ? 'هفته‌های فرد' : 'هفته‌های زوج'}
                    </div>
                    ` : ''}
                    <div class="course-detail-status ${detailClass}">
                        <i class="${detailIcon}"></i>
                        جزئیات درس: ${detailStatus}
                    </div>
                </div>
            </div>
            <div class="course-actions">
                <button class="btn-icon ${hasDetails ? 'success' : 'primary'}" 
                        onclick="fumPopup.extractCourseDetail('${course.id || index}')" 
                        title="${hasDetails ? 'بروزرسانی جزئیات' : 'استخراج جزئیات از طرح درس'}">
                    <i class="fas fa-book-open"></i>
                </button>
                <button class="btn-icon" onclick="fumPopup.addToGoogleCalendar('${course.id || index}')" 
                        title="افزودن به Google Calendar">
                    <i class="fab fa-google"></i>
                </button>
                <button class="btn-icon danger" onclick="fumPopup.removeCourse('${course.id || index}')" 
                        title="حذف درس">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        `;
        
        return courseDiv;
    }

    async extractCourseDetail(courseId) {
        try {
            this.showNotification('در حال استخراج جزئیات درس...', 'info');
            
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            // Find the course by ID or index
            let course = this.courses.find(c => c.id === courseId);
            if (!course) {
                const index = parseInt(courseId);
                if (index >= 0 && index < this.courses.length) {
                    course = this.courses[index];
                }
            }
            
            if (!course) {
                this.showNotification('درس مورد نظر یافت نشد', 'error');
                return;
            }
            
            const response = await Promise.race([
                chrome.tabs.sendMessage(tab.id, { 
                    action: 'extractCourseDetail', 
                    courseId: courseId,
                    course: course
                }),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('عملیات استخراج جزئیات منقضی شد')), 10000)
                )
            ]);
            
            if (response && response.success && response.details) {
                const courseIndex = this.courses.findIndex(c => (c.id === courseId) || (this.courses.indexOf(c) == courseId));
                if (courseIndex !== -1) {
                    // Format details for Google Calendar with HTML support
                    this.courses[courseIndex].courseDetails = this.formatCourseDetailsForCalendar(response.details);
                    this.courses[courseIndex].needsDetailExtraction = false;
                    await this.saveData();
                    this.updateUI();
                    this.showNotification('جزئیات درس با موفقیت استخراج شد', 'success');
                }
            } else {
                this.showNotification('خطا در استخراج جزئیات: ' + (response?.error || 'نامشخص'), 'error');
            }
            
        } catch (error) {
            console.error('Error extracting course detail:', error);
            let errorMsg = error.message;
            
            if (errorMsg.includes('message channel closed')) {
                errorMsg = 'ارتباط با صفحه قطع شد';
            } else if (errorMsg.includes('Could not establish connection')) {
                errorMsg = 'امکان برقراری ارتباط وجود ندارد';
            }
            
            this.showNotification('خطا در استخراج جزئیات: ' + errorMsg, 'error');
        }
    }

    formatCourseDetailsForCalendar(details) {
        // Format course details with HTML tags supported by Google Calendar
        const formatted = {};
        
        if (details.title) {
            formatted.title = `<h3>${details.title}</h3>`;
        }
        
        if (details.code) {
            formatted.code = `<strong>کد درس:</strong> <code>${details.code}</code>`;
        }
        
        if (details.credits) {
            formatted.credits = `<strong>تعداد واحد:</strong> ${details.credits}`;
        }
        
        if (details.prerequisites) {
            formatted.prerequisites = `<h4>پیش‌نیازها:</h4><p>${details.prerequisites}</p>`;
        }
        
        if (details.corequisites) {
            formatted.corequisites = `<h4>هم‌نیازها:</h4><p>${details.corequisites}</p>`;
        }
        
        if (details.evaluation) {
            formatted.evaluation = `<h4>نحوه ارزشیابی:</h4><blockquote>${details.evaluation}</blockquote>`;
        }
        
        if (details.syllabus) {
            formatted.syllabus = `<h4>سرفصل درس:</h4><pre>${details.syllabus}</pre>`;
        }
        
        if (details.resources) {
            const resources = details.resources.split('\\n').filter(r => r.trim());
            if (resources.length > 1) {
                formatted.resources = `<h4>منابع و مراجع:</h4><ul>${resources.map(r => `<li>${r.trim()}</li>`).join('')}</ul>`;
            } else {
                formatted.resources = `<h4>منابع و مراجع:</h4><p>${details.resources}</p>`;
            }
        }
        
        if (details.objectives) {
            formatted.objectives = `<h4>اهداف درس:</h4><p><em>${details.objectives}</em></p>`;
        }
        
        return formatted;
    }

    async addToGoogleCalendar(courseId) {
        // Find the course by ID or index
        let course = this.courses.find(c => c.id === courseId);
        if (!course) {
            const index = parseInt(courseId);
            if (index >= 0 && index < this.courses.length) {
                course = this.courses[index];
            }
        }
        
        if (!course) {
            this.showNotification('درس مورد نظر یافت نشد', 'error');
            return;
        }
        
        try {
            // Use the content script to generate proper calendar link with formatted details
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            const response = await chrome.tabs.sendMessage(tab.id, { 
                action: 'generateCalendarLink', 
                course: course 
            });
            
            if (response && response.link) {
                window.open(response.link, '_blank');
                this.showNotification('درس به Google Calendar اضافه شد', 'success');
            } else {
                // Fallback to manual link generation with HTML formatting
                const calendarLink = this.generateAdvancedCalendarLink(course);
                window.open(calendarLink, '_blank');
                this.showNotification('درس به Google Calendar اضافه شد', 'success');
            }
            
        } catch (error) {
            console.error('Calendar link error:', error);
            // Generate advanced calendar link as fallback
            const calendarLink = this.generateAdvancedCalendarLink(course);
            window.open(calendarLink, '_blank');
            this.showNotification('درس به Google Calendar اضافه شد', 'success');
        }
    }

    generateAdvancedCalendarLink(course) {
        const baseUrl = 'https://calendar.google.com/calendar/render?action=TEMPLATE';
        
        // Build description with HTML formatting
        let description = `<h3>${course.name}</h3>`;
        description += `<p><strong>استاد:</strong> ${course.teacher}</p>`;
        description += `<p><strong>مکان:</strong> ${course.location}</p>`;
        
        if (course.credits) {
            description += `<p><strong>واحد:</strong> ${course.credits}</p>`;
        }
        
        if (course.isOddWeek || course.isEvenWeek) {
            description += `<p><strong>الگو:</strong> ${course.isOddWeek ? 'هفته‌های فرد' : 'هفته‌های زوج'}</p>`;
        }
        
        // Add formatted course details if available
        if (course.courseDetails) {
            const details = course.courseDetails;
            description += '<br><hr><br>';
            
            Object.values(details).forEach(detail => {
                if (detail && detail.trim()) {
                    description += detail + '<br>';
                }
            });
        }
        
        const params = new URLSearchParams({
            text: course.name,
            details: description,
            location: course.location
        });
        
        return `${baseUrl}&${params.toString()}`;
    }

    generateBasicCalendarLink(course) {
        const baseUrl = 'https://calendar.google.com/calendar/render?action=TEMPLATE';
        const params = new URLSearchParams({
            text: course.name,
            details: `استاد: ${course.teacher}\\nمکان: ${course.location}${course.credits ? `\\nواحد: ${course.credits}` : ''}`,
            location: course.location
        });
        return `${baseUrl}&${params.toString()}`;
    }

    async removeCourse(courseId) {
        if (confirm('آیا از حذف این درس اطمینان دارید؟')) {
            // Find by ID or index
            let courseIndex = this.courses.findIndex(c => c.id === courseId);
            if (courseIndex === -1) {
                courseIndex = parseInt(courseId);
            }
            
            if (courseIndex >= 0 && courseIndex < this.courses.length) {
                this.courses.splice(courseIndex, 1);
                await this.saveData();
                this.updateUI();
                this.showNotification('درس حذف شد', 'success');
            } else {
                this.showNotification('درس مورد نظر یافت نشد', 'error');
            }
        }
    }

    // ... other methods continue here (exportToGoogle, exportToICS, etc.)

    toggleSettings() {
        const toggle = document.getElementById('settingsToggle');
        const panel = document.getElementById('settingsPanel');
        
        toggle.classList.toggle('active');
        panel.classList.toggle('open');
    }

    toggleExportSection() {
        const exportSection = document.getElementById('exportSection');
        exportSection.style.display = this.courses.length > 0 ? 'block' : 'none';
    }

    setLoadingState(loading) {
        this.isLoading = loading;
        const autoBtn = document.getElementById('autoExtractBtn');
        const manualBtn = document.getElementById('manualExtractBtn');
        
        if (loading) {
            autoBtn.classList.add('loading');
            manualBtn.disabled = true;
            autoBtn.disabled = true;
        } else {
            autoBtn.classList.remove('loading');
            manualBtn.disabled = false;
            autoBtn.disabled = false;
        }
    }

    showProgress(text, percent) {
        const container = document.getElementById('progressContainer');
        const textElement = document.getElementById('progressText');
        const percentElement = document.getElementById('progressPercent');
        const fillElement = document.getElementById('progressFill');
        
        container.style.display = 'block';
        textElement.textContent = text;
        percentElement.textContent = `${percent}%`;
        fillElement.style.width = `${percent}%`;
        
        this.currentProgress = percent;
    }

    hideProgress() {
        const container = document.getElementById('progressContainer');
        container.style.display = 'none';
    }

    updateStatus(text = 'آماده', type = 'success') {
        const statusText = document.getElementById('status').querySelector('.status-text');
        const statusDot = document.getElementById('status').querySelector('.status-dot');
        
        statusText.textContent = text;
        
        statusDot.className = 'status-dot';
        if (type === 'error') {
            statusDot.style.background = 'var(--danger-color)';
        } else if (type === 'warning') {
            statusDot.style.background = 'var(--warning-color)';
        } else if (type === 'info') {
            statusDot.style.background = 'var(--info-color)';
        } else {
            statusDot.style.background = 'var(--success-color)';
        }
    }

    showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.className = `notification ${type} show`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }

    async waitForNavigation(tabId, urlPattern) {
        return new Promise((resolve) => {
            const checkNavigation = async () => {
                try {
                    const tab = await chrome.tabs.get(tabId);
                    if (tab.url && tab.url.includes(urlPattern)) {
                        resolve();
                    } else {
                        setTimeout(checkNavigation, 500);
                    }
                } catch (error) {
                    resolve(); // Resolve anyway if tab is not accessible
                }
            };
            checkNavigation();
        });
    }

    parseScheduleDate(day, time) {
        const now = new Date();
        const dayMap = {
            'شنبه': 6, 'یکشنبه': 0, 'دوشنبه': 1, 'سه‌شنبه': 2, 
            'چهارشنبه': 3, 'پنج‌شنبه': 4, 'جمعه': 5
        };
        
        const targetDay = dayMap[day] || 0;
        const date = new Date(now);
        const daysUntilTarget = (targetDay - date.getDay() + 7) % 7;
        date.setDate(date.getDate() + daysUntilTarget);
        
        const timeMatch = time.match(/(\\d{1,2}):?(\\d{0,2})/);
        if (timeMatch) {
            const hour = parseInt(timeMatch[1]);
            const minute = parseInt(timeMatch[2] || '0');
            date.setHours(hour, minute, 0, 0);
        }
        
        return date;
    }

    formatICSDate(date) {
        return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.fumPopup = new FumCalendarModernPopup();
});

// Make some methods globally accessible for inline event handlers
window.fumPopup = null;