# Fum Calendar Extractor - استخراج برنامه درسی فردوسی

A Chrome extension to extract course schedule data from Ferdowsi University of Mashhad's student portal and generate Google Calendar links.

## Features / ویژگی‌ها

- **Course Data Extraction**: Automatically extract course information from the university schedule page
- **Persian Language Support**: Full RTL layout and Persian text handling
- **Google Calendar Integration**: Generate direct links to add courses to Google Calendar
- **Course Editor**: Edit course details before adding to calendar
- **Recurring Events**: Automatically set up weekly recurring events
- **Export Functionality**: Export extracted data as JSON
- **Minimal UI**: Clean and intuitive Persian interface

## Installation / نصب

### Method 1: Developer Mode (روش ۱: حالت توسعه‌دهنده)

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" in the top right
3. Click "Load unpacked" and select the `chrome-extension` folder
4. The extension will be installed and ready to use

### Method 2: CRX Package (روش ۲: بسته CRX)

1. Package the extension into a `.crx` file
2. Install the packaged extension

## Usage / نحوه استفاده

1. **Navigate to Portal**: Go to your Ferdowsi University student portal (`pooya.um.ac.ir`)
2. **Open Schedule**: Navigate to your course schedule page
3. **Extract Courses**: Click the extension icon and press "استخراج دروس"
4. **Edit Details**: Use the edit button to modify course information
5. **Add to Calendar**: Click the calendar button to add courses to Google Calendar

## How It Works / نحوه کار

### Content Script
- Scans the schedule page for course information
- Extracts course names, times, locations, and instructor details
- Identifies links to detailed course pages (red book icons)
- Converts Persian text and handles RTL layout

### Data Extraction
The extension extracts the following information:
- Course name (نام درس)
- Instructor (استاد)
- Time and day (زمان و روز)
- Location/classroom (مکان/کلاس)
- Additional details (جزئیات اضافی)

### Google Calendar Integration
- Generates properly formatted Google Calendar links
- Sets up recurring weekly events
- Includes all course details in the event description
- Handles Persian calendar to Gregorian conversion

## File Structure / ساختار فایل‌ها

```
chrome-extension/
├── manifest.json          # Extension configuration
├── icons/                 # Extension icons
│   └── icon.svg
└── src/
    ├── background.js      # Service worker
    ├── content.js         # Content script for data extraction
    ├── content.css        # Content script styles
    ├── popup.html         # Extension popup interface
    ├── popup.css          # Popup styles
    └── popup.js           # Popup functionality
```

## Technical Details / جزئیات فنی

### Permissions
- `activeTab`: Access current tab content
- `storage`: Store extracted course data
- `tabs`: Create new tabs for calendar links
- Host permission for `pooya.um.ac.ir`

### Supported Pages
- Course schedule/timetable pages
- Individual course detail pages
- Persian calendar pages

### Browser Compatibility
- Chrome 88+
- Chromium-based browsers
- Edge (Chromium)

## Development / توسعه

### Prerequisites
- Basic knowledge of Chrome Extension APIs
- Understanding of Persian/Farsi text handling
- Familiarity with University portal structure

### Testing
1. Load the extension in developer mode
2. Navigate to the university portal
3. Test extraction on different schedule formats
4. Verify Google Calendar link generation

### Debugging
- Use Chrome Developer Tools
- Check console logs in both popup and content script
- Test with different schedule layouts

## Customization / سفارشی‌سازی

### Modifying Extraction Logic
Edit `src/content.js` to adjust how courses are identified and extracted:

```javascript
// Modify course detection patterns
const coursePattern = /[\u0600-\u06FF\s]+/;

// Adjust time parsing
const timePattern = /(\d{1,2}:\d{2}|\d{1,2}-\d{1,2})/g;
```

### Styling Changes
Modify `src/popup.css` and `src/content.css` to change appearance:

```css
:root {
    --primary-color: #your-color;
    --success-color: #your-success-color;
}
```

### Adding New Features
1. Update `manifest.json` permissions if needed
2. Add functionality to appropriate script files
3. Update UI components in popup files

## Troubleshooting / عیب‌یابی

### Common Issues

**No courses extracted**:
- Ensure you're on the correct schedule page
- Check if page structure has changed
- Verify content script is loaded

**Persian text not displaying correctly**:
- Check font loading in CSS
- Verify RTL direction is set
- Ensure Persian text encoding

**Calendar links not working**:
- Check date format conversion
- Verify Google Calendar URL structure
- Test with different browsers

### Debug Information
Enable debug mode by adding to console:
```javascript
localStorage.setItem('fumDebug', 'true');
```

## Contributing / مشارکت

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly with Persian content
5. Submit a pull request

## License / مجوز

MIT License - Feel free to modify and distribute

## Changelog / تغییرات

### Version 1.0.0
- Initial release
- Basic course extraction
- Google Calendar integration
- Persian language support
- Minimal UI design

## Support / پشتیبانی

For issues and questions:
- Check the console for error messages
- Verify you're using a supported browser
- Ensure the university portal structure hasn't changed

---

**Note**: This extension is designed specifically for Ferdowsi University of Mashhad's student portal. It may require adjustments for other university systems.

**نکته**: این افزونه مخصوص پرتال دانشجویی دانشگاه فردوسی مشهد طراحی شده است و ممکن است برای سایر سیستم‌های دانشگاهی نیاز به تنظیم داشته باشد.