// Popup JavaScript for Fum Calendar Extractor

class FumCalendarPopup {
    constructor() {
        this.courses = [];
        this.currentEditCourse = null;
        this.init();
    }

    async init() {
        // Load courses from storage
        await this.loadCourses();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Update UI
        this.updateUI();
        this.updateStatus();
    }

    setupEventListeners() {
        // Main action buttons
        document.getElementById('extractBtn').addEventListener('click', () => this.extractCourses());
        document.getElementById('refreshBtn').addEventListener('click', () => this.refreshData());
        document.getElementById('exportBtn').addEventListener('click', () => this.exportData());
        document.getElementById('addAllBtn').addEventListener('click', () => this.addAllToCalendar());

        // Modal controls
        document.getElementById('closeModal').addEventListener('click', () => this.closeModal());
        document.getElementById('saveEdit').addEventListener('click', () => this.saveEdit());
        document.getElementById('cancelEdit').addEventListener('click', () => this.closeModal());

        // Click outside modal to close
        document.getElementById('editModal').addEventListener('click', (e) => {
            if (e.target.id === 'editModal') {
                this.closeModal();
            }
        });
    }

    async loadCourses() {
        const result = await chrome.storage.local.get(['fumCourses']);
        this.courses = result.fumCourses || [];
    }

    async saveCourses() {
        await chrome.storage.local.set({ fumCourses: this.courses });
    }

    async extractCourses() {
        const extractBtn = document.getElementById('extractBtn');
        extractBtn.classList.add('loading');
        extractBtn.disabled = true;

        try {
            // Get current active tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!tab.url.includes('pooya.um.ac.ir')) {
                this.showToast('لطفاً در صفحه پرتال دانشگاه فردوسی باشید', 'warning');
                return;
            }

            // Send message to content script
            const response = await chrome.tabs.sendMessage(tab.id, { action: 'extractCourses' });
            
            if (response && response.courses) {
                this.courses = response.courses;
                await this.saveCourses();
                this.updateUI();
                this.updateStatus();
                this.showToast(`${this.courses.length} درس استخراج شد`);
            } else {
                this.showToast('هیچ درسی یافت نشد', 'warning');
            }
        } catch (error) {
            console.error('Error extracting courses:', error);
            this.showToast('خطا در استخراج دروس', 'error');
        } finally {
            extractBtn.classList.remove('loading');
            extractBtn.disabled = false;
        }
    }

    async refreshData() {
        await this.loadCourses();
        this.updateUI();
        this.updateStatus();
        this.showToast('داده‌ها بروزرسانی شد');
    }

    updateUI() {
        const container = document.getElementById('coursesContainer');
        const emptyState = document.getElementById('emptyState');

        if (this.courses.length === 0) {
            container.innerHTML = '';
            container.appendChild(emptyState);
            return;
        }

        // Hide empty state and show courses
        if (emptyState.parentNode) {
            emptyState.remove();
        }

        container.innerHTML = this.courses.map(course => this.createCourseCard(course)).join('');

        // Add event listeners to action buttons
        container.querySelectorAll('.edit-btn').forEach((btn, index) => {
            btn.addEventListener('click', () => this.editCourse(index));
        });

        container.querySelectorAll('.calendar-btn').forEach((btn, index) => {
            btn.addEventListener('click', () => this.addToCalendar(index));
        });

        container.querySelectorAll('.delete-btn').forEach((btn, index) => {
            btn.addEventListener('click', () => this.deleteCourse(index));
        });
    }

    createCourseCard(course) {
        return `
            <div class="course-card">
                <div class="course-header">
                    <div class="course-name">${course.name}</div>
                    <div class="course-actions">
                        <button class="action-btn edit-btn" title="ویرایش">✏️</button>
                        <button class="action-btn calendar-btn" title="افزودن به تقویم">📅</button>
                        <button class="action-btn delete-btn" title="حذف">🗑️</button>
                    </div>
                </div>
                <div class="course-info">
                    ${course.instructor ? `<div><span class="info-label">استاد:</span>${course.instructor}</div>` : ''}
                    ${course.day ? `<div><span class="info-label">روز:</span>${course.day}</div>` : ''}
                    ${course.time ? `<div><span class="info-label">زمان:</span>${course.time}</div>` : ''}
                    ${course.location ? `<div><span class="info-label">مکان:</span>${course.location}</div>` : ''}
                    ${course.details ? `<div><span class="info-label">جزئیات:</span>${course.details}</div>` : ''}
                </div>
            </div>
        `;
    }

    updateStatus() {
        document.getElementById('courseCount').textContent = this.courses.length;
        document.getElementById('lastUpdate').textContent = new Date().toLocaleString('fa-IR');
    }

    editCourse(index) {
        this.currentEditCourse = index;
        const course = this.courses[index];

        // Fill modal with course data
        document.getElementById('editName').value = course.name || '';
        document.getElementById('editInstructor').value = course.instructor || '';
        document.getElementById('editTime').value = course.time || '';
        document.getElementById('editLocation').value = course.location || '';
        document.getElementById('editDay').value = course.day || '';
        document.getElementById('editDetails').value = course.details || '';

        // Show modal
        document.getElementById('editModal').style.display = 'block';
    }

    async saveEdit() {
        if (this.currentEditCourse === null) return;

        const course = this.courses[this.currentEditCourse];
        
        // Update course with form data
        course.name = document.getElementById('editName').value;
        course.instructor = document.getElementById('editInstructor').value;
        course.time = document.getElementById('editTime').value;
        course.location = document.getElementById('editLocation').value;
        course.day = document.getElementById('editDay').value;
        course.details = document.getElementById('editDetails').value;

        await this.saveCourses();
        this.updateUI();
        this.closeModal();
        this.showToast('تغییرات ذخیره شد');
    }

    closeModal() {
        document.getElementById('editModal').style.display = 'none';
        this.currentEditCourse = null;
    }

    async addToCalendar(index) {
        const course = this.courses[index];
        const calendarUrl = this.generateGoogleCalendarLink(course);
        
        try {
            await chrome.tabs.create({ url: calendarUrl });
            this.showToast('لینک تقویم باز شد');
        } catch (error) {
            console.error('Error opening calendar:', error);
            this.showToast('خطا در باز کردن تقویم', 'error');
        }
    }

    async addAllToCalendar() {
        if (this.courses.length === 0) {
            this.showToast('هیچ درسی برای اضافه کردن وجود ندارد', 'warning');
            return;
        }

        for (let i = 0; i < this.courses.length; i++) {
            const course = this.courses[i];
            const calendarUrl = this.generateGoogleCalendarLink(course);
            
            // Add small delay between opening tabs to prevent browser blocking
            setTimeout(() => {
                chrome.tabs.create({ url: calendarUrl });
            }, i * 500);
        }

        this.showToast(`${this.courses.length} درس به تقویم اضافه می‌شود`);
    }

    async deleteCourse(index) {
        if (confirm('آیا مطمئن هستید که می‌خواهید این درس را حذف کنید؟')) {
            this.courses.splice(index, 1);
            await this.saveCourses();
            this.updateUI();
            this.updateStatus();
            this.showToast('درس حذف شد');
        }
    }

    generateGoogleCalendarLink(course) {
        const baseUrl = 'https://calendar.google.com/calendar/render?action=TEMPLATE';
        
        // Parse Persian date to Gregorian
        const startDate = this.parseScheduleDate(course.day, course.time);
        const endDate = new Date(startDate.getTime() + 90 * 60000); // 90 minutes later
        
        const eventTitle = course.name;
        const eventDescription = [
            course.instructor ? `استاد: ${course.instructor}` : '',
            course.location ? `مکان: ${course.location}` : '',
            course.details ? `جزئیات: ${course.details}` : ''
        ].filter(Boolean).join('\\n');

        const params = new URLSearchParams({
            text: eventTitle,
            dates: `${this.formatGoogleDate(startDate)}/${this.formatGoogleDate(endDate)}`,
            details: eventDescription,
            location: course.location || '',
            recur: 'RRULE:FREQ=WEEKLY;BYDAY=' + this.getDayAbbreviation(course.day)
        });

        return `${baseUrl}&${params.toString()}`;
    }

    parseScheduleDate(day, time) {
        const now = new Date();
        const dayMap = {
            'شنبه': 6, 'یکشنبه': 0, 'دوشنبه': 1, 'سه‌شنبه': 2,
            'چهارشنبه': 3, 'پنج‌شنبه': 4, 'جمعه': 5
        };
        
        const targetDay = dayMap[day] || 0;
        const date = new Date(now);
        
        // Find next occurrence of this day
        const dayDiff = (targetDay - date.getDay() + 7) % 7;
        date.setDate(date.getDate() + dayDiff);
        
        // Parse time (assume format like "8:00" or "8-10" or "۸:۰۰")
        let hour = 8; // default
        
        if (time) {
            // Convert Persian digits to English
            const englishTime = time.replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
            const timeMatch = englishTime.match(/(\d{1,2})/);
            if (timeMatch) {
                hour = parseInt(timeMatch[1]);
            }
        }
        
        date.setHours(hour, 0, 0, 0);
        return date;
    }

    getDayAbbreviation(day) {
        const dayMap = {
            'شنبه': 'SA', 'یکشنبه': 'SU', 'دوشنبه': 'MO', 'سه‌شنبه': 'TU',
            'چهارشنبه': 'WE', 'پنج‌شنبه': 'TH', 'جمعه': 'FR'
        };
        return dayMap[day] || 'MO';
    }

    formatGoogleDate(date) {
        return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    }

    exportData() {
        const data = {
            courses: this.courses,
            exportDate: new Date().toISOString(),
            totalCourses: this.courses.length
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `fum-courses-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.showToast('فایل JSON دانلود شد');
    }

    showToast(message, type = 'success') {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = `toast ${type}`;
        toast.classList.add('show');

        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new FumCalendarPopup();
});