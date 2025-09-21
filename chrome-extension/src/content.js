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
            
            switch (request.action) {
                case 'extractCourses':
                    this.extractCourses()
                        .then(courses => {
                            console.log('Sending extracted courses:', courses.length);
                            sendResponse({ courses: courses, success: true });
                        })
                        .catch(error => {
                            console.error('Extract courses error:', error);
                            sendResponse({ success: false, error: error.message });
                        });
                    return true; // Keep message channel open
                    
                case 'autoExtractWithDetails':
                    Promise.resolve(this.autoExtractWithDetails())
                        .then(courses => {
                            console.log('Auto extract completed:', courses.length);
                            try {
                                sendResponse({ courses: courses, success: true });
                            } catch (responseError) {
                                console.error('Error sending response:', responseError);
                            }
                        })
                        .catch(error => {
                            console.error('Auto extract error:', error);
                            try {
                                sendResponse({ success: false, error: error.message });
                            } catch (responseError) {
                                console.error('Error sending error response:', responseError);
                            }
                        });
                    return true; // Keep message channel open
                    
                case 'getCourses':
                    sendResponse({ courses: this.courses, success: true });
                    return false;
                    
                case 'extractCourseDetail':
                    this.extractCourseDetail(request.courseId)
                        .then(details => {
                            sendResponse({ details: details, success: true });
                        })
                        .catch(error => {
                            console.error('Extract detail error:', error);
                            sendResponse({ success: false, error: error.message });
                        });
                    return true; // Keep message channel open
                    
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
        const hasDays = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه شنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه'].some(day => text.includes(day));
        const hasYellowCells = table.querySelector('td[bgcolor="#FFF3CD"], td[style*="FFF3CD"]');
        
        console.log('جدول چک:', { hasTimeHeaders, hasDays, hasYellowCells });
        return hasTimeHeaders && hasDays && hasYellowCells;
    }

    async extractFromFerdowsiScheduleTable(table, doc) {
        console.log('استخراج از جدول فردوسی');
        const rows = table.querySelectorAll('tr');
        const days = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه شنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه'];
        const timeHeaders = ['6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20'];
        
        // Process each row to find course data
        for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
            const row = rows[rowIndex];
            const cells = row.querySelectorAll('td, th');
            
            // Find the day cell - usually the first cell in the row
            let currentDay = '';
            const dayCell = cells[0];
            if (dayCell) {
                const dayText = dayCell.textContent.trim();
                console.log(`Checking day cell text: "${dayText}"`);
                
                // Try to match any of the day names
                for (const day of days) {
                    if (dayText.includes(day)) {
                        currentDay = day;
                        console.log(`Found day: ${currentDay}`);
                        break;
                    }
                }
                
                // If no day found, try partial matching for rowspan cells
                if (!currentDay) {
                    // Check if this row continues from previous row (rowspan)
                    const previousRows = Array.from(rows).slice(Math.max(0, rowIndex - 3), rowIndex);
                    for (const prevRow of previousRows.reverse()) {
                        const prevDayCell = prevRow.querySelector('td[rowspan], th[rowspan]');
                        if (prevDayCell) {
                            const prevDayText = prevDayCell.textContent.trim();
                            for (const day of days) {
                                if (prevDayText.includes(day)) {
                                    currentDay = day;
                                    console.log(`Found day from previous rowspan: ${currentDay}`);
                                    break;
                                }
                            }
                            if (currentDay) break;
                        }
                    }
                }
            }
            
            console.log(`Row ${rowIndex}: Day = ${currentDay || 'not found'}`);
            
            if (!currentDay) {
                console.warn(`No day found for row ${rowIndex}, skipping...`);
                continue;
            }
            
            // Process each cell in the row for course data (skip first cell which is the day)
            for (let cellIndex = 1; cellIndex < cells.length; cellIndex++) {
                const cell = cells[cellIndex];
                const bgColor = cell.getAttribute('bgcolor') || cell.style.backgroundColor;
                
                // Look for course cells (usually have yellow background #FFF3CD)
                if (bgColor === '#FFF3CD' || bgColor.includes('FFF3CD') || bgColor === '#fff3cd') {
                    const timeSlot = this.calculateTimeFromCellPosition(cellIndex, timeHeaders);
                    console.log(`Found course cell at ${currentDay} ${timeSlot}`);
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

        // Debug: Check what day is being passed
        if (!day || day === '') {
            console.warn('Day is empty, trying to extract from cell position...');
            const { day: cellDay, time: cellTime } = this.findDayAndTimeFromCell(cell);
            day = cellDay || 'نامشخص';
            time = cellTime || time;
            console.log(`Day extracted from cell position: ${day}, ${time}`);
        }

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
                console.log(`درس اضافه شد با روز: ${day} و ساعت: ${time}`);
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
        const days = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه شنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه'];
        
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
                cleanup();
                reject(new Error('Iframe load timeout'));
            }, 5000);

            const cleanup = () => {
                iframe.removeEventListener('load', handleLoad);
                iframe.removeEventListener('error', handleError);
                clearTimeout(timeout);
            };

            const handleLoad = () => {
                cleanup();
                setTimeout(resolve, 100); // Small delay to ensure content is ready
            };

            const handleError = () => {
                cleanup();
                reject(new Error('Iframe load error'));
            };

            iframe.addEventListener('load', handleLoad);
            iframe.addEventListener('error', handleError);
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
            
            // Don't navigate if already on correct page to avoid closing message channel
            if (!currentUrl.includes('ShowStSchedule.php')) {
                console.log('صفحه فعلی برنامه هفتگی نیست. لطفاً به صفحه برنامه هفتگی بروید.');
                throw new Error('لطفاً ابتدا به صفحه برنامه هفتگی دانشگاه بروید');
            }
            
            // Extract courses from schedule page with timeout
            const extractPromise = this.extractCourses();
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('استخراج دروس زمان زیادی طول کشید')), 15000)
            );
            
            await Promise.race([extractPromise, timeoutPromise]);
            
            // Add basic details for each course to avoid popup issues
            if (this.courses.length > 0) {
                console.log('اضافه کردن جزئیات پایه برای', this.courses.length, 'درس');
                for (let i = 0; i < this.courses.length && i < 10; i++) { // Limit to 10 courses to prevent timeout
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

    // Extract data from course detail page (طرح درس)
    async extractFromDetailPage(url) {
        return new Promise((resolve, reject) => {
            console.log('Opening course detail page:', url);
            
            // Open detail page in a new window
            const detailWindow = window.open(url, '_blank', 'width=900,height=700');
            
            if (!detailWindow) {
                reject(new Error('امکان باز کردن صفحه جزئیات وجود ندارد'));
                return;
            }
            
            // Wait for page to load and extract comprehensive data
            const extractData = () => {
                try {
                    const doc = detailWindow.document;
                    console.log('Extracting course details from:', doc.title);
                    
                    // Extract comprehensive course details
                    const details = {
                        // Basic info
                        title: this.extractFromDetailTable(doc, 'عنوان') || this.extractTableText(doc, 0),
                        instructor: this.extractFromDetailTable(doc, 'نام استاد'),
                        department: this.extractFromDetailTable(doc, 'دانشکده'),
                        courseType: this.extractFromDetailTable(doc, 'نوع درس'),
                        academicYear: this.extractFromDetailTable(doc, 'سال تحصیلی'),
                        credits: this.extractFromDetailTable(doc, 'تعداد واحد'),
                        
                        // Class schedule and location
                        classSchedule: this.extractClassSchedule(doc),
                        
                        // Course structure
                        coursePosition: this.extractFromDetailTable(doc, 'جایگاه درس در برنامه درسی دوره'),
                        generalObjective: this.extractFromDetailTable(doc, 'هدف کلی'),
                        prerequisites: this.extractFromDetailTable(doc, 'شایستگی های پایه'),
                        
                        // Resources and materials
                        mainResources: this.extractFromDetailTable(doc, 'منابع اصلی درس'),
                        assistantResources: this.extractFromDetailTable(doc, 'منابع کمکی درس'),
                        teachingMaterials: this.extractFromDetailTable(doc, 'مواد و امکانات آموزشی'),
                        
                        // Evaluation
                        evaluation: this.extractEvaluationMethod(doc),
                        
                        // Session schedule with dates
                        sessionSchedule: this.extractSessionSchedule(doc),
                        
                        // Student assignments
                        studentTasks: this.extractFromDetailTable(doc, 'وظایف دانشجو') || this.extractFromDetailTable(doc, 'تکالیف دانشجو')
                    };
                    
                    console.log('Extracted course details:', details);
                    
                    // Close the detail window
                    detailWindow.close();
                    
                    resolve(details);
                } catch (error) {
                    console.error('Error extracting course details:', error);
                    detailWindow.close();
                    reject(error);
                }
            };
            
            // Wait for page to load
            detailWindow.addEventListener('load', () => {
                setTimeout(extractData, 2000); // Give it time to fully render
            });
            
            // Timeout fallback
            setTimeout(() => {
                if (!detailWindow.closed) {
                    detailWindow.close();
                }
                reject(new Error('تایم اوت در بارگذاری صفحه جزئیات'));
            }, 15000);
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

    // Extract information from detail page tables
    extractFromDetailTable(doc, keyword) {
        const rows = doc.querySelectorAll('tr');
        for (const row of rows) {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 2) {
                const firstCell = cells[0].textContent.trim();
                if (firstCell.includes(keyword)) {
                    return cells[1].textContent.trim();
                }
            }
        }
        return '';
    }

    // Extract class schedule (multiple sessions with days/times)
    extractClassSchedule(doc) {
        const scheduleInfo = {};
        
        // Look for the schedule section
        const scheduleSection = this.findElementContaining(doc, 'زمان و محل برگزاري كلاس');
        if (scheduleSection) {
            const scheduleText = scheduleSection.textContent;
            
            // Extract first session
            const firstSessionMatch = scheduleText.match(/جلسه اول روز\s*:\s*([^(]+)\(([^)]+)\)\s*([^<\n]+)/);
            if (firstSessionMatch) {
                scheduleInfo.session1 = {
                    day: firstSessionMatch[1].trim(),
                    details: firstSessionMatch[2].trim(),
                    location: firstSessionMatch[3].trim()
                };
            }
            
            // Extract second session
            const secondSessionMatch = scheduleText.match(/جلسه دوم روز\s*:\s*([^(]+)\(([^)]+)\)\s*([^<\n]+)/);
            if (secondSessionMatch) {
                scheduleInfo.session2 = {
                    day: secondSessionMatch[1].trim(),
                    details: secondSessionMatch[2].trim(),
                    location: secondSessionMatch[3].trim()
                };
            }
        }
        
        return scheduleInfo;
    }

    // Extract evaluation method with detailed breakdown
    extractEvaluationMethod(doc) {
        const evaluationText = this.extractFromDetailTable(doc, 'نحوه ارزشیابی');
        if (!evaluationText) return '';
        
        // Parse the evaluation components
        const components = [];
        const lines = evaluationText.split(/\n|\d+\)/);
        
        for (const line of lines) {
            if (line.trim() && line.includes(':')) {
                const [method, score] = line.split(':');
                components.push({
                    method: method.trim(),
                    score: score.trim()
                });
            }
        }
        
        return {
            raw: evaluationText,
            components: components
        };
    }

    // Extract session schedule with dates
    extractSessionSchedule(doc) {
        const sessions = [];
        
        // Find the syllabus table
        const syllabusTable = this.findTableByCaption(doc, 'سرفصل مطالب');
        if (syllabusTable) {
            const rows = syllabusTable.querySelectorAll('tbody tr');
            
            for (const row of rows) {
                const cells = row.querySelectorAll('td');
                if (cells.length >= 2) {
                    const topic = cells[0].textContent.trim();
                    const date = cells[1].textContent.trim();
                    
                    if (topic && date && date !== '--') {
                        sessions.push({
                            topic: topic,
                            date: date,
                            persianDate: this.convertGregorianToPersian(date)
                        });
                    }
                }
            }
        }
        
        return sessions;
    }

    // Helper method to find element containing specific text
    findElementContaining(doc, text) {
        const elements = doc.querySelectorAll('td, div, span');
        for (const element of elements) {
            if (element.textContent.includes(text)) {
                return element;
            }
        }
        return null;
    }

    // Helper method to find table by caption
    findTableByCaption(doc, caption) {
        const tables = doc.querySelectorAll('table');
        for (const table of tables) {
            const tableCaption = table.querySelector('caption');
            if (tableCaption && tableCaption.textContent.includes(caption)) {
                return table;
            }
        }
        return null;
    }

    // Convert Gregorian date to Persian (placeholder for now)
    convertGregorianToPersian(gregorianDate) {
        // This is a simplified conversion - you may want to use a proper date library
        return gregorianDate; // For now, return as is
    }

    // Extract table text by index (fallback method)
    extractTableText(doc, tableIndex) {
        const tables = doc.querySelectorAll('table');
        if (tables[tableIndex]) {
            const firstRow = tables[tableIndex].querySelector('tr');
            if (firstRow) {
                const cells = firstRow.querySelectorAll('td, th');
                if (cells.length > 0) {
                    return cells[0].textContent.trim();
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
            // Handle multiple sessions if available
            const sessions = this.extractSessionsFromCourse(course);
            const calendarEvents = [];
            
            for (const session of sessions) {
                const startDate = this.parseJalaliScheduleDate(session.day, session.time);
                const endDate = new Date(startDate.getTime() + 90 * 60000); // 90 minutes later
                
                // Create comprehensive event description
                let description = this.buildEventDescription(course, session);
                
                const params = new URLSearchParams({
                    text: `${course.name} - ${session.day}`,
                    dates: `${this.formatGoogleDate(startDate)}/${this.formatGoogleDate(endDate)}`,
                    details: description,
                    location: session.location || course.location,
                    recur: this.buildRecurrenceRule(session, course)
                });

                calendarEvents.push(`${baseUrl}&${params.toString()}`);
            }
            
            // Return the first event link (or create a general one if no specific sessions)
            return calendarEvents.length > 0 ? calendarEvents[0] : this.createFallbackCalendarLink(course);
            
        } catch (error) {
            console.error('خطا در تولید لینک Google Calendar:', error);
            return this.createFallbackCalendarLink(course);
        }
    }

    // Extract sessions from course (handle multiple sessions per week)
    extractSessionsFromCourse(course) {
        const sessions = [];
        
        // Check if course has detailed class schedule
        if (course.courseDetails?.classSchedule) {
            const schedule = course.courseDetails.classSchedule;
            
            // Add first session
            if (schedule.session1) {
                sessions.push({
                    day: this.extractDayFromDetails(schedule.session1.day),
                    time: this.extractTimeFromDetails(schedule.session1.details),
                    location: schedule.session1.location,
                    duration: this.extractDurationFromDetails(schedule.session1.details),
                    frequency: this.extractFrequencyFromDetails(schedule.session1.details),
                    isOddWeek: schedule.session1.details.includes('شروع فرد'),
                    isEvenWeek: schedule.session1.details.includes('شروع زوج')
                });
            }
            
            // Add second session
            if (schedule.session2) {
                sessions.push({
                    day: this.extractDayFromDetails(schedule.session2.day),
                    time: this.extractTimeFromDetails(schedule.session2.details),
                    location: schedule.session2.location,
                    duration: this.extractDurationFromDetails(schedule.session2.details),
                    frequency: this.extractFrequencyFromDetails(schedule.session2.details),
                    isOddWeek: schedule.session2.details.includes('شروع فرد'),
                    isEvenWeek: schedule.session2.details.includes('شروع زوج')
                });
            }
        }
        
        // Fallback: use basic course info
        if (sessions.length === 0) {
            sessions.push({
                day: course.day,
                time: course.time,
                location: course.location,
                duration: 90,
                frequency: 'WEEKLY',
                isOddWeek: course.isOddWeek,
                isEvenWeek: course.isEvenWeek
            });
        }
        
        return sessions;
    }

    // Build comprehensive event description with HTML formatting
    buildEventDescription(course, session) {
        let description = '';
        
        // Basic course info
        description += `<b>نام درس:</b> ${course.originalName || course.name}\\n`;
        description += `<b>استاد:</b> ${course.teacher}\\n`;
        description += `<b>تعداد واحد:</b> ${course.credits || 'نامشخص'}\\n`;
        description += `<b>مکان:</b> ${session.location}\\n\\n`;
        
        // Add detailed course information if available
        if (course.courseDetails) {
            const details = course.courseDetails;
            
            if (details.evaluation?.raw) {
                description += `<b>نحوه ارزشیابی:</b>\\n${details.evaluation.raw}\\n\\n`;
            }
            
            if (details.mainResources) {
                description += `<b>منابع اصلی:</b>\\n${details.mainResources}\\n\\n`;
            }
            
            if (details.studentTasks) {
                description += `<b>وظایف دانشجو:</b>\\n${details.studentTasks}\\n\\n`;
            }
            
            if (details.generalObjective) {
                description += `<b>هدف کلی درس:</b>\\n${details.generalObjective}\\n\\n`;
            }
            
            // Add session schedule if available
            if (details.sessionSchedule && details.sessionSchedule.length > 0) {
                description += `<b>برنامه جلسات:</b>\\n`;
                for (const sessionInfo of details.sessionSchedule.slice(0, 5)) { // First 5 sessions
                    description += `${sessionInfo.date}: ${sessionInfo.topic}\\n`;
                }
                if (details.sessionSchedule.length > 5) {
                    description += `... و ${details.sessionSchedule.length - 5} جلسه دیگر\\n`;
                }
                description += '\\n';
            }
        }
        
        // Add session specific info
        if (session.isOddWeek) description += `⚠️ هفته‌های فرد\\n`;
        if (session.isEvenWeek) description += `⚠️ هفته‌های زوج\\n`;
        
        return description;
    }

    // Build recurrence rule for Google Calendar
    buildRecurrenceRule(session, course) {
        let rule = 'RRULE:FREQ=WEEKLY';
        
        // Handle odd/even weeks
        if (session.isOddWeek || session.isEvenWeek) {
            rule += ';INTERVAL=2';
        }
        
        // Add end date (end of semester)
        const semesterEnd = this.getSemesterEndDate();
        if (semesterEnd) {
            rule += `;UNTIL=${this.formatGoogleDate(semesterEnd)}`;
        }
        
        return rule;
    }

    // Get semester end date (placeholder - you may want to make this configurable)
    getSemesterEndDate() {
        const now = new Date();
        const endDate = new Date(now.getFullYear(), 11, 31); // End of year for now
        return endDate;
    }

    // Create fallback calendar link for basic course info
    createFallbackCalendarLink(course) {
        const baseUrl = 'https://calendar.google.com/calendar/render?action=TEMPLATE';
        const startDate = this.parseJalaliScheduleDate(course.day, course.time);
        const endDate = new Date(startDate.getTime() + 90 * 60000);
        
        const params = new URLSearchParams({
            text: course.name,
            dates: `${this.formatGoogleDate(startDate)}/${this.formatGoogleDate(endDate)}`,
            details: `استاد: ${course.teacher}\\nمکان: ${course.location}`,
            location: course.location,
            recur: 'RRULE:FREQ=WEEKLY'
        });

        return `${baseUrl}&${params.toString()}`;
    }

    // Helper methods for extracting session details
    extractDayFromDetails(dayText) {
        const days = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه شنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه'];
        for (const day of days) {
            if (dayText.includes(day)) {
                return day;
            }
        }
        return dayText.trim();
    }

    extractTimeFromDetails(details) {
        const timeMatch = details.match(/ساعت\s*(\d{1,2})/);
        return timeMatch ? `${timeMatch[1]}:00` : '';
    }

    extractDurationFromDetails(details) {
        const durationMatch = details.match(/(\d+)\s*دقیقه/);
        return durationMatch ? parseInt(durationMatch[1]) : 90;
    }

    extractFrequencyFromDetails(details) {
        if (details.includes('هر هفته')) return 'WEEKLY';
        if (details.includes('هفته در میان')) return 'WEEKLY;INTERVAL=2';
        return 'WEEKLY';
    }

    // Parse Jalali/Persian date to Gregorian
    parseJalaliScheduleDate(day, time) {
        const now = new Date();
        const dayMap = {
            'شنبه': 6, 'یکشنبه': 0, 'دوشنبه': 1, 'سه شنبه': 2, 'سه‌شنبه': 2,
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