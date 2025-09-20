// Content script for extracting course data from Ferdowsi University portal
// Prevent multiple injections
if (typeof window.FumCalendarExtractor === 'undefined') {
    
class FumCalendarExtractor {
    constructor() {
        this.courses = [];
        this.detailsCache = new Map();
        this.init();
    }

    init() {
        // Add extraction button
        this.addExtractButton();

        // Listen for messages from popup
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            console.log('Content script received message:', request.action);
            
            const handleAsyncResponse = async (asyncFunction) => {
                try {
                    const result = await asyncFunction();
                    sendResponse(result);
                } catch (error) {
                    console.error('Async handler error:', error);
                    sendResponse({ success: false, error: error.message });
                }
            };
            
            switch (request.action) {
                case 'extractCourses':
                    handleAsyncResponse(async () => {
                        const courses = await this.extractCourses();
                        console.log('Sending extracted courses:', courses.length);
                        return { courses: courses, success: true };
                    });
                    return true;
                    
                case 'autoExtractWithDetails':
                    handleAsyncResponse(async () => {
                        const courses = await this.autoExtractWithDetails();
                        console.log('Auto extract completed:', courses.length);
                        return { courses: courses, success: true };
                    });
                    return true;
                    
                case 'getCourses':
                    sendResponse({ courses: this.courses, success: true });
                    return false;
                    
                case 'extractCourseDetail':
                    handleAsyncResponse(async () => {
                        const details = await this.extractCourseDetail(request.courseId);
                        return { details: details, success: true };
                    });
                    return true;
                    
                case 'generateCalendarLink':
                    try {
                        const link = this.generateGoogleCalendarLink(request.course);
                        sendResponse({ link: link, success: true });
                    } catch (error) {
                        sendResponse({ link: null, success: false, error: error.message });
                    }
                    return false;
                    
                default:
                    sendResponse({ success: false, error: 'Unknown action: ' + request.action });
                    return false;
            }
        });
    }

    addExtractButton() {
        // No floating button - extraction only through extension popup
        console.log('Fum Calendar content script loaded - ready for extraction commands');
    }

    async extractCourses() {
        try {
            console.log('شروع استخراج دروس از پرتال دانشگاه فردوسی...');
            
            this.courses = [];

            // Try to find the schedule in iframe
            const iframe = document.getElementById('LeftScr') || 
                          document.querySelector('iframe[name="LeftScr"]') ||
                          document.querySelector('iframe');

            if (iframe) {
                await this.extractFromIframe(iframe);
            } else {
                // Extract from current page
                await this.extractFromCurrentPage();
            }

            // Save courses to storage
            if (this.courses.length > 0) {
                chrome.storage.local.set({ fumCourses: this.courses });
            }

            console.log(`استخراج شده: ${this.courses.length} درس`, this.courses);
            return this.courses;

        } catch (error) {
            console.error('خطا در استخراج دروس:', error);
            throw error;
        }
    }

    async extractFromIframe(iframe) {
        try {
            // Wait for iframe to load
            await this.waitForIframe(iframe);
            
            const doc = iframe.contentDocument || iframe.contentWindow.document;
            if (!doc) {
                throw new Error('دسترسی به محتوای iframe امکان پذیر نیست');
            }

            await this.extractFromDocument(doc);
        } catch (error) {
            console.warn('خطا در استخراج از iframe:', error);
            // Fallback to current page
            await this.extractFromCurrentPage();
        }
    }

    async extractFromCurrentPage() {
        await this.extractFromDocument(document);
    }

    async extractFromDocument(doc) {
        console.log('استخراج از سند...', doc.title, doc.URL);
        
        // Look for the specific Ferdowsi schedule table
        const scheduleTable = doc.querySelector('table.table.table-sm.border.cell-border');
        if (scheduleTable) {
            console.log('جدول برنامه هفتگی پیدا شد');
            await this.extractFromFerdowsiScheduleTable(scheduleTable, doc);
            return;
        }

        // Fallback: Look for any table with schedule indicators
        const tables = doc.querySelectorAll('table');
        let foundCourses = false;

        for (const table of tables) {
            if (this.isFerdowsiScheduleTable(table)) {
                console.log('جدول شبیه برنامه پیدا شد');
                await this.extractFromFerdowsiScheduleTable(table, doc);
                foundCourses = true;
                break;
            }
        }

        if (!foundCourses) {
            // Method 3: Search all colored cells for course data
            await this.extractFromColoredCells(doc);
        }
    }

    isFerdowsiScheduleTable(table) {
        // Look for specific Ferdowsi schedule indicators
        const text = table.textContent;
        const hasTimeHeaders = text.includes('6') && text.includes('7') && text.includes('8'); // Hour columns
        const hasDays = ['شنبه', 'یکشنبه', 'دوشنبه', 'چهارشنبه', 'پنج‌شنبه'].some(day => text.includes(day));
        const hasYellowCells = table.querySelector('td[bgcolor="#FFF3CD"], td[style*="FFF3CD"]');
        
        console.log('جدول چک:', { hasTimeHeaders, hasDays, hasYellowCells });
        return hasTimeHeaders && hasDays && hasYellowCells;
    }

    async extractFromFerdowsiScheduleTable(table, doc) {
        console.log('استخراج از جدول فردوسی');
        const rows = table.querySelectorAll('tr');
        const days = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه'];
        const timeHeaders = ['6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20'];
        
        // Process each row to find course data
        for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
            const row = rows[rowIndex];
            const cells = row.querySelectorAll('td, th');
            
            // Find the day cell
            let currentDay = '';
            const dayCell = cells[0];
            if (dayCell) {
                const dayText = dayCell.textContent.trim();
                currentDay = days.find(day => dayText.includes(day)) || '';
            }
            
            if (!currentDay) continue;
            
            // Process each cell in the row for course data
            for (let cellIndex = 1; cellIndex < cells.length; cellIndex++) {
                const cell = cells[cellIndex];
                const bgColor = cell.getAttribute('bgcolor') || cell.style.backgroundColor;
                
                // Look for course cells (usually have yellow background #FFF3CD)
                if (bgColor === '#FFF3CD' || bgColor.includes('FFF3CD')) {
                    const timeSlot = this.calculateTimeFromCellPosition(cellIndex, timeHeaders);
                    await this.extractFerdowsiCourseFromCell(cell, currentDay, timeSlot, doc);
                }
            }
        }
    }

    async extractFromColoredCells(doc) {
        console.log('استخراج از سلول‌های رنگی');
        // Look for all yellow/colored cells that might contain course data
        const yellowCells = doc.querySelectorAll('td[bgcolor="#FFF3CD"], td[style*="FFF3CD"], td[style*="background-color: #FFF3CD"]');
        
        console.log(`پیدا شد ${yellowCells.length} سلول زرد`);
        
        for (const cell of yellowCells) {
            const text = cell.textContent?.trim();
            if (text && text.length > 10 && this.looksLikeFerdowsiCourse(text)) {
                // Try to determine day and time from table structure
                const { day, time } = this.findDayAndTimeFromCell(cell);
                await this.extractFerdowsiCourseFromCell(cell, day, time, doc);
            }
        }
        
        // Also try text-based extraction as ultimate fallback
        if (this.courses.length === 0) {
            await this.extractFromTextElements(doc);
        }
    }
    
    async extractFromTextElements(doc) {
        // Search all text elements for course patterns
        const elements = doc.querySelectorAll('*');
        
        for (const element of elements) {
            const text = element.textContent?.trim();
            if (text && this.looksLikeFerdowsiCourse(text)) {
                const course = await this.parseFerdowsiCourseText(text, element, doc);
                if (course) {
                    this.addCourse(course);
                }
            }
        }
    }

    async extractFerdowsiCourseFromCell(cell, day, time, doc) {
        const text = cell.textContent?.trim();
        if (!text || text === '-' || text.length < 10) return;

        console.log(`استخراج از سلول: ${day} ${time}`, text.substring(0, 100));

        // Clean the text by removing HTML artifacts and extra whitespace
        const cleanText = text
            .replace(/=D[0-9A-F]{1,2}/g, '') // Remove HTML encoding artifacts
            .replace(/\s+/g, ' ')
            .replace(/[\n\r]/g, ' ')
            .trim();

        if (this.looksLikeFerdowsiCourse(cleanText)) {
            const course = await this.parseFerdowsiCourseText(cleanText, cell, doc);
            if (course) {
                course.day = day;
                course.time = time;
                this.addCourse(course);
            }
        }
    }

    looksLikeFerdowsiCourse(text) {
        // Check for Ferdowsi University course patterns
        const ferdowsiPatterns = [
            /\([0-9]+\).*,.*,.*\(.*\)/, // name(credit), teacher, (location)
            /[؀-ۿ\s]+\([0-9]+\)/, // Persian text with credits
            /کلاس\s*[A-Z0-9-]+/, // Class code
            /شروع\s*(فرد|زوج)/, // Odd/even weeks
        ];

        const hasFerdowsiPattern = ferdowsiPatterns.some(pattern => pattern.test(text));
        const isReasonableLength = text.length > 15 && text.length < 300;
        const hasCommas = (text.match(/,/g) || []).length >= 1;
        
        console.log('بررسی متن:', text.substring(0, 50) + '...', { hasFerdowsiPattern, isReasonableLength, hasCommas });
        return hasFerdowsiPattern && isReasonableLength && hasCommas;
    }

    async parseFerdowsiCourseText(text, element, doc) {
        console.log('پردازش متن درس:', text);
        
        // Parse Ferdowsi format: name(credit), teacher, (location) with optional odd/even week info
        const patterns = [
            // Main pattern: course(credits), teacher, (location)
            /^([^،]+\([^)]*\))[\s،]*([^،\n(]+)[\s،]*\(([^)]*)\)/,
            // Alternative: without parentheses around location
            /^([^،]+\([^)]*\))[\s،]*([^،\n]+)[\s،]*([A-Z0-9-]+)/,
            // Fallback: split by commas
            /^([^،]+)[\s،]+([^،]+)[\s،]*(.+)$/
        ];

        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) {
                let courseName = this.cleanPersianText(match[1]);
                let teacher = this.cleanPersianText(match[2] || '');
                let location = this.cleanPersianText(match[3] || '');

                // Extract credits from course name
                const creditsMatch = courseName.match(/\((\d+)\)/);
                const credits = creditsMatch ? creditsMatch[1] : '';

                // Clean up location (remove کلاس prefix and extra parentheses)
                location = location.replace(/[()]|کلاس\s*/g, '').trim();

                // Check for odd/even week patterns
                let recurrence = 'WEEKLY';
                let isOddWeek = false;
                let isEvenWeek = false;
                
                if (text.includes('شروع فرد')) {
                    recurrence = 'WEEKLY;INTERVAL=2';
                    isOddWeek = true;
                } else if (text.includes('شروع زوج')) {
                    recurrence = 'WEEKLY;INTERVAL=2';
                    isEvenWeek = true;
                }

                // Look for detail icons
                const detailInfo = this.findFerdowsiDetailInfo(element);

                const course = {
                    id: this.generateId(courseName, teacher),
                    name: `${courseName} - ${teacher}`, // Combined format as requested
                    originalName: courseName,
                    teacher: teacher,
                    location: location,
                    credits: credits,
                    day: '',
                    time: '',
                    recurrence: recurrence,
                    isOddWeek: isOddWeek,
                    isEvenWeek: isEvenWeek,
                    detailInfo: detailInfo,
                    rawText: text,
                    needsDetailExtraction: true  // Flag for detail extraction
                };

                console.log('درس استخراج شد:', course);
                return course;
            }
        }

        console.warn('قالب تطبیق نیافت:', text);
        return null;
    }

    cleanPersianText(text) {
        if (!text) return '';
        return text
            .replace(/[\u060c,\n\r]/g, ' ')  // Replace Persian comma, regular comma, newlines
            .replace(/\s+/g, ' ')         // Collapse multiple spaces
            .replace(/=D[0-9A-F]{1,2}/g, '') // Remove HTML encoding artifacts
            .trim();
    }
    
    cleanText(text) {
        return text.replace(/[,\n\r]/g, ' ').replace(/\s+/g, ' ').trim();
    }

    calculateTimeFromCellPosition(cellIndex, timeHeaders) {
        // Cell index 1 = hour 6, cell index 2 = hour 7, etc.
        const hourIndex = cellIndex - 1;
        if (hourIndex >= 0 && hourIndex < timeHeaders.length) {
            return `${timeHeaders[hourIndex]}:00`;
        }
        return '';
    }
    
    findDayAndTimeFromCell(cell) {
        const table = cell.closest('table');
        const row = cell.closest('tr');
        const days = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه'];
        
        let day = '';
        let time = '';
        
        if (row) {
            // Find day from first cell in row
            const firstCell = row.querySelector('td');
            if (firstCell) {
                const dayText = firstCell.textContent.trim();
                day = days.find(d => dayText.includes(d)) || '';
            }
            
            // Calculate time from cell position
            const cells = Array.from(row.querySelectorAll('td'));
            const cellIndex = cells.indexOf(cell);
            if (cellIndex > 0) {
                const hour = 5 + cellIndex; // Assuming schedule starts at 6AM
                time = `${hour}:00`;
            }
        }
        
        return { day, time };
    }
    
    findFerdowsiDetailInfo(element) {
        // Look for Ferdowsi-specific detail icons
        const infoIcon = element.querySelector('i.fa-info-circle');
        const bookIcon = element.querySelector('i.fa-book-open');
        const detailSpans = element.querySelectorAll('span[title]');
        
        const detailInfo = {
            hasInfoIcon: !!infoIcon,
            hasBookIcon: !!bookIcon,
            tooltips: []
        };
        
        detailSpans.forEach(span => {
            const tooltip = span.getAttribute('title');
            if (tooltip) {
                detailInfo.tooltips.push(tooltip);
            }
        });
        
        return detailInfo;
    }

    async fetchCourseDetails(course, detailUrl, doc) {
        try {
            // This would need to be implemented based on the actual detail page
            // For now, we'll add placeholder detailed information
            course.details = {
                evaluation: 'نحوه ارزشیابی: کویز و پروژه',
                resources: 'منبع: کتاب درسی و مقالات',
                title: `عنوان: ${course.name}`,
                sessions: 'تاریخ جلسه: طبق برنامه هفتگی'
            };
        } catch (error) {
            console.warn('خطا در دریافت جزئیات درس:', error);
        }
    }

    addCourse(course) {
        // Check if course already exists
        const existingIndex = this.courses.findIndex(c => 
            c.name === course.name && c.teacher === course.teacher
        );

        if (existingIndex >= 0) {
            // Add as additional session
            const existing = this.courses[existingIndex];
            if (!existing.sessions) {
                existing.sessions = [];
            }
            existing.sessions.push({
                day: course.day,
                time: course.time,
                location: course.location,
                recurrence: course.recurrence,
                isOddWeek: course.isOddWeek,
                isEvenWeek: course.isEvenWeek
            });
        } else {
            this.courses.push(course);
        }
    }

    generateId(name, teacher) {
        const text = `${name} - ${teacher}`;
        return btoa(encodeURIComponent(text)).substring(0, 8);
    }

    waitForIframe(iframe) {
        return new Promise((resolve, reject) => {
            if (iframe.contentDocument && iframe.contentDocument.readyState === 'complete') {
                resolve();
                return;
            }

            const timeout = setTimeout(() => {
                reject(new Error('Iframe load timeout'));
            }, 5000);

            iframe.onload = () => {
                clearTimeout(timeout);
                setTimeout(resolve, 100); // Small delay to ensure content is ready
            };

            iframe.onerror = () => {
                clearTimeout(timeout);
                reject(new Error('Iframe load error'));
            };
        });
    }

    showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            background: ${type === 'error' ? '#f44336' : '#4CAF50'};
            color: white;
            padding: 10px 15px;
            border-radius: 5px;
            z-index: 10001;
            font-family: 'Tahoma', sans-serif;
            font-size: 12px;
            direction: rtl;
        `;
        
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 3000);
    }

    // Auto-extraction with navigation to schedule page
    async autoExtractWithDetails() {
        try {
            console.log('شروع استخراج هوشمند...');
            
            // Check if we're already on the schedule page
            const currentUrl = window.location.href;
            const scheduleUrl = 'https://pooya.um.ac.ir/educ/educfac/ShowStSchedule.php';
            
            if (!currentUrl.includes('ShowStSchedule.php')) {
                // Navigate to schedule page
                console.log('جابجایی به صفحه برنامه هفتگی...');
                window.location.href = scheduleUrl;
                
                // Wait for navigation to complete
                await new Promise(resolve => {
                    const checkNavigation = () => {
                        if (window.location.href.includes('ShowStSchedule.php')) {
                            resolve();
                        } else {
                            setTimeout(checkNavigation, 100);
                        }
                    };
                    checkNavigation();
                });
            }
            
            // Extract courses from schedule page
            await this.extractCourses();
            
            // Add basic details for each course to avoid popup issues
            if (this.courses.length > 0) {
                console.log('اضافه کردن جزئیات پایه برای', this.courses.length, 'درس');
                for (let i = 0; i < this.courses.length; i++) {
                    const course = this.courses[i];
                    try {
                        // Add basic course details without opening popups
                        const details = this.generateBasicCourseDetails(course);
                        this.courses[i].courseDetails = details;
                        this.courses[i].needsDetailExtraction = false;
                        
                        console.log('جزئیات پایه اضافه شد برای:', course.name);
                    } catch (error) {
                        console.error('خطا در اضافه کردن جزئیات برای ' + course.name + ':', error);
                        this.courses[i].needsDetailExtraction = true;
                    }
                }
            }
            
            return this.courses;
            
        } catch (error) {
            console.error('خطا در استخراج هوشمند:', error);
            throw error;
        }
    }

    // Extract details for all courses
    async extractAllCourseDetails() {
        for (const course of this.courses) {
            if (course.detailInfo?.hasBookIcon) {
                try {
                    const details = await this.extractCourseDetailFromPage(course);
                    if (details) {
                        course.courseDetails = details;
                        course.needsDetailExtraction = false;
                    }
                } catch (error) {
                    console.warn(`خطا در استخراج جزئیات درس ${course.originalName}:`, error);
                }
                
                // Small delay between requests
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
    }

    // Extract course detail from specific course page
    async extractCourseDetail(courseId) {
        const course = this.courses.find(c => c.id === courseId);
        if (!course) {
            throw new Error('درس یافت نشد');
        }
        
        return await this.extractCourseDetailFromPage(course);
    }

    // Enhanced course detail extraction method
    async extractCourseDetail(courseId) {
        try {
            console.log('استخراج جزئیات درس برای ID:', courseId);
            
            // Find course in our courses array
            const course = this.courses.find(c => c.id === courseId) || this.courses[parseInt(courseId)];
            
            if (!course) {
                throw new Error('درس مورد نظر یافت نشد');
            }
            
            // Try to extract from the current page first
            const iframe = document.getElementById('LeftScr') || document.querySelector('iframe[name="LeftScr"]');
            const doc = iframe ? (iframe.contentDocument || iframe.contentWindow.document) : document;
            
            // Look for the course in schedule table
            const courseCells = doc.querySelectorAll('td[bgcolor="#FFF3CD"], td[bgcolor="#fff3cd"]');
            let targetCell = null;
            
            // Try to match by course name and teacher
            for (const cell of courseCells) {
                const cellText = cell.textContent;
                if (cellText.includes(course.originalName || course.name) || 
                    (course.teacher && cellText.includes(course.teacher))) {
                    targetCell = cell;
                    break;
                }
            }
            
            if (targetCell) {
                // Look for the course detail link (طرح درس)
                const detailLink = targetCell.querySelector('span[title*="طرح درس"] i.fa-book-open') || 
                                 targetCell.querySelector('span[onclick*="window.open"]');
                
                if (detailLink) {
                    const span = detailLink.closest('span');
                    const onclick = span ? span.getAttribute('onclick') : null;
                    
                    if (onclick) {
                        const urlMatch = onclick.match(/window\.open\s*\(\s*['"]([^'"]+)['"]/);
                        if (urlMatch) {
                            const detailUrl = urlMatch[1];
                            console.log('استخراج از URL:', detailUrl);
                            
                            // Extract details from the detail page
                            return await this.extractFromDetailPage(detailUrl);
                        }
                    }
                }
            }
            
            // Fallback: return basic information if no detail page found
            return this.generateBasicCourseDetails(course);
            
        } catch (error) {
            console.error('خطا در استخراج جزئیات درس:', error);
            throw error;
        }
    }

    // Generate basic course details as fallback
    generateBasicCourseDetails(course) {
        return {
            title: course.name || course.courseName,
            code: course.courseCode || 'نامشخص',
            credits: course.credits || 'نامشخص', 
            teacher: course.teacher || 'نامشخص',
            location: course.location || 'نامشخص',
            day: course.day || 'نامشخص',
            time: course.time || 'نامشخص',
            evaluation: 'اطلاعات دقیق در دسترس نیست',
            syllabus: 'برای مشاهده سرفصل دقیق، به سایت دانشگاه مراجعه کنید',
            prerequisites: 'نیاز به بررسی بیشتر',
            resources: 'منابع درسی توسط استاد اعلام خواهد شد'
        };
    }

    // Extract course details by navigating to course detail page (legacy method name for compatibility)
    async extractCourseDetailFromPage(course) {
        console.log('استخراج جزئیات درس:', course.name);
        try {
            // Use the enhanced extractCourseDetail method
            return await this.extractCourseDetail(course.id || this.courses.indexOf(course));
        } catch (error) {
            console.error('خطا در استخراج جزئیات درس ' + course.name + ':', error);
            // Return basic details as fallback
            return this.generateBasicCourseDetails(course);
        }
    }

    // Extract data from course detail page
    async extractFromDetailPage(url) {
        return new Promise((resolve, reject) => {
            // Open detail page in a new window
            const detailWindow = window.open(url, '_blank', 'width=800,height=600');
            
            if (!detailWindow) {
                reject(new Error('امکان باز کردن صفحه جزئیات وجود ندارد'));
                return;
            }
            
            // Wait for page to load and extract data
            const extractData = () => {
                try {
                    const doc = detailWindow.document;
                    
                    // Extract course details from the page
                    const details = {
                        title: this.extractDetailText(doc, ['عنوان درس', 'نام درس']),
                        code: this.extractDetailText(doc, ['کد درس']),
                        credits: this.extractDetailText(doc, ['تعداد واحد', 'واحد']),
                        prerequisites: this.extractDetailText(doc, ['پیش نیاز', 'پیشنیاز']),
                        corequisites: this.extractDetailText(doc, ['هم نیاز', 'هم‌نیاز']),
                        evaluation: this.extractDetailText(doc, ['نحوه ارزشیابی', 'ارزشیابی']),
                        syllabus: this.extractDetailText(doc, ['سرفصل', 'محتوای درس', 'سیلابس']),
                        resources: this.extractDetailText(doc, ['منابع', 'کتاب', 'مرجع']),
                        objectives: this.extractDetailText(doc, ['اهداف', 'هدف'])
                    };
                    
                    // Close the detail window
                    detailWindow.close();
                    
                    resolve(details);
                } catch (error) {
                    detailWindow.close();
                    reject(error);
                }
            };
            
            // Wait for page to load
            detailWindow.addEventListener('load', () => {
                setTimeout(extractData, 1000); // Give it a moment to fully render
            });
            
            // Timeout fallback
            setTimeout(() => {
                if (!detailWindow.closed) {
                    detailWindow.close();
                }
                reject(new Error('تایم اوت در بارگذاری صفحه جزئیات'));
            }, 10000);
        });
    }

    // Helper method to extract specific text from detail page
    extractDetailText(doc, keywords) {
        for (const keyword of keywords) {
            const elements = doc.querySelectorAll('td, div, span, p');
            for (const element of elements) {
                const text = element.textContent;
                if (text && text.includes(keyword)) {
                    // Try to find the value in next sibling or table cell
                    const parent = element.closest('tr') || element.parentElement;
                    if (parent) {
                        const cells = parent.querySelectorAll('td');
                        if (cells.length > 1) {
                            return cells[1].textContent?.trim() || '';
                        }
                    }
                    
                    // Try next element sibling
                    const next = element.nextElementSibling;
                    if (next) {
                        return next.textContent?.trim() || '';
                    }
                    
                    // Try extracting from the same element after the keyword
                    const colonIndex = text.indexOf(':');
                    if (colonIndex > -1) {
                        return text.substring(colonIndex + 1).trim();
                    }
                }
            }
        }
        return '';
    }

    // Helper method to get setting values
    async getSettingValue(key, defaultValue) {
        try {
            const result = await chrome.storage.local.get([key]);
            return result[key] !== undefined ? result[key] : defaultValue;
        } catch (error) {
            return defaultValue;
        }
    }

    // Generate proper Google Calendar dates with Persian/Jalali support
    generateGoogleCalendarLink(course) {
        const baseUrl = 'https://calendar.google.com/calendar/render?action=TEMPLATE';
        
        try {
            // Parse Persian date to Gregorian
            const startDate = this.parseJalaliScheduleDate(course.day, course.time);
            const endDate = new Date(startDate.getTime() + 90 * 60000); // 90 minutes later
            
            // Create event description with course details
            let description = `استاد: ${course.teacher}\\nمکان: ${course.location}`;
            if (course.credits) {
                description += `\\nتعداد واحد: ${course.credits}`;
            }
            if (course.courseDetails) {
                if (course.courseDetails.evaluation) {
                    description += `\\nارزشیابی: ${course.courseDetails.evaluation}`;
                }
                if (course.courseDetails.syllabus) {
                    description += `\\nسرفصل: ${course.courseDetails.syllabus.substring(0, 100)}...`;
                }
            }
            
            const params = new URLSearchParams({
                text: course.name,
                dates: `${this.formatGoogleDate(startDate)}/${this.formatGoogleDate(endDate)}`,
                details: description,
                location: course.location,
                recur: `RRULE:FREQ=WEEKLY${course.recurrence.includes('INTERVAL=2') ? ';INTERVAL=2' : ''}`
            });

            return `${baseUrl}&${params.toString()}`;
        } catch (error) {
            console.error('خطا در تولید لینک Google Calendar:', error);
            return null;
        }
    }

    // Parse Jalali/Persian date to Gregorian
    parseJalaliScheduleDate(day, time) {
        const now = new Date();
        const dayMap = {
            'شنبه': 6, 'یکشنبه': 0, 'دوشنبه': 1, 'سه‌شنبه': 2, 
            'چهارشنبه': 3, 'پنج‌شنبه': 4, 'جمعه': 5
        };
        
        const targetDay = dayMap[day] || 0;
        const date = new Date(now);
        
        // Find next occurrence of the target day
        const daysUntilTarget = (targetDay - date.getDay() + 7) % 7;
        date.setDate(date.getDate() + daysUntilTarget);
        
        // Parse time (format: "8:00" or "8")
        const timeMatch = time.match(/(\d{1,2}):?(\d{0,2})/);
        if (timeMatch) {
            const hour = parseInt(timeMatch[1]);
            const minute = parseInt(timeMatch[2] || '0');
            date.setHours(hour, minute, 0, 0);
        }
        
        return date;
    }

    formatGoogleDate(date) {
        return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    }
}

// Mark the class as defined to prevent re-injection issues
window.FumCalendarExtractor = FumCalendarExtractor;

// Initialize the extractor when the script loads
console.log('Loading Fum Calendar content script...');
new FumCalendarExtractor();

} else {
    console.log('Fum Calendar content script already loaded, skipping re-injection');
}