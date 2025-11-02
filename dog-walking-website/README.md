# Towerlands Dog Walkers Website

A professional, modern website for a dog walking business located in Towerlands Park, Braintree, Essex.

## 🐕 Features

### **Design & User Experience**
- **Responsive Design**: Works perfectly on desktop, tablet, and mobile devices
- **Modern UI**: Clean, professional design with smooth animations
- **Accessibility**: WCAG compliant with keyboard navigation and screen reader support
- **Fast Loading**: Optimized CSS and JavaScript for quick page loads

### **Website Sections**
1. **Hero Section**: Eye-catching introduction with call-to-action buttons
2. **Services**: Detailed information about dog walking services
3. **About Us**: Build trust with company information and features
4. **Pricing**: Transparent pricing with package deals
5. **Contact**: Interactive booking form with contact information
6. **Footer**: Navigation links and social media

### **Interactive Features**
- **Mobile Navigation**: Hamburger menu for mobile devices
- **Smooth Scrolling**: Seamless navigation between sections
- **Form Validation**: Real-time validation with helpful error messages
- **Animations**: Scroll-triggered animations for engaging user experience
- **Parallax Effects**: Subtle depth effects on hero section
- **Back to Top Button**: Easy navigation for long pages
- **Form Data Persistence**: Saves user input in localStorage

### **Technical Features**
- **SEO Optimized**: Meta tags, semantic HTML5, and structured data
- **Performance**: Lightweight code with efficient CSS/JavaScript
- **Cross-browser Compatible**: Works on all modern browsers
- **Print Friendly**: Optimized print styles

## 🚀 Getting Started

### **Local Development**
1. Clone or download the website files
2. Navigate to the website directory
3. Start a local HTTP server:

```bash
# Using Python 3
python3 -m http.server 8080

# Using Node.js (if available)
npx serve .

# Using PHP (if available)
php -S localhost:8080
```

4. Open your browser and visit `http://localhost:8080`

### **File Structure**
```
dog-walking-website/
├── index.html          # Main HTML file
├── styles.css          # Complete styling
├── script.js           # Interactive functionality
├── README.md           # This file
└── assets/             # Images and other assets (add as needed)
```

## 📝 Customization

### **Branding**
- **Colors**: Update CSS variables in `styles.css` (lines 15-25)
- **Fonts**: Change Google Fonts in HTML `<head>` section
- **Logo**: Replace the paw icon with your business logo
- **Business Name**: Update throughout HTML files

### **Content**
- **Services**: Modify service descriptions and features
- **Pricing**: Update prices and package deals
- **Contact Info**: Change phone, email, and address
- **Images**: Add real photos of dogs and Towerlands Park

### **Form Functionality**
The contact form currently simulates submission. To make it functional:

1. **Email Service**: Integrate with services like:
   - Formspree (easy)
   - Netlify Forms
   - EmailJS
   - Custom backend

2. **Example with Formspree**:
   ```html
   <form action="https://formspree.io/your-email@example.com" method="POST">
   ```

## 🎨 Design Customization

### **Color Scheme**
Primary colors are defined as CSS variables:
```css
:root {
    --primary-color: #2c5530;    /* Green */
    --secondary-color: #8fbc8f;   /* Light Green */
    --accent-color: #ff6b35;      /* Orange */
}
```

### **Typography**
Uses Poppins font from Google Fonts. Change in the HTML `<head>`:
```html
<link href="https://fonts.googleapis.com/css2?family=YourFont&display=swap" rel="stylesheet">
```

### **Responsive Breakpoints**
- Mobile: < 768px
- Tablet: 768px - 1024px
- Desktop: > 1024px

## 📱 Mobile Features

### **Touch Optimized**
- Large tap targets for buttons and links
- Smooth scrolling and gestures
- Responsive navigation menu

### **Performance**
- Optimized images (add WebP format)
- Minimal JavaScript for fast loading
- Efficient CSS with mobile-first approach

## 🔧 Technical Details

### **HTML5 Semantic Structure**
- Proper header, main, section, and footer elements
- Meta tags for SEO and social sharing
- Accessibility attributes (ARIA labels)

### **CSS Features**
- CSS Grid and Flexbox for layout
- CSS Variables for theming
- Smooth transitions and animations
- Mobile-first responsive design

### **JavaScript Features**
- Vanilla JavaScript (no dependencies)
- Event delegation for performance
- LocalStorage for form data persistence
- Intersection Observer for animations

## 📊 SEO Features

### **On-Page SEO**
- Optimized title tags and meta descriptions
- Heading hierarchy (H1, H2, H3)
- Alt text for images
- Semantic HTML structure

### **Local SEO**
- Business name and location in title
- Contact information clearly displayed
- Service area mentioned
- Structured data ready (add JSON-LD)

## 🚀 Deployment

### **Static Hosting**
Deploy to any static hosting service:
- **Netlify**: Drag and drop folder
- **Vercel**: Connect GitHub repository
- **GitHub Pages**: Free hosting
- **Firebase Hosting**: Google's hosting
- **Surge.sh**: Simple deployment

### **Example Deployment Commands**
```bash
# Using Surge
npm install -g surge
surge

# Using Netlify CLI
npm install -g netlify-cli
netlify deploy --prod --dir .
```

## 📈 Analytics & Tracking

### **Google Analytics**
Add to `<head>` section:
```html
<!-- Google Analytics -->
<script async src="https://www.googletagmanager.com/gtag/js?id=GA_MEASUREMENT_ID"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'GA_MEASUREMENT_ID');
</script>
```

### **Facebook Pixel**
Add to `<head>` section:
```html
<!-- Facebook Pixel -->
<script>
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', 'YOUR-PIXEL-ID');
fbq('track', 'PageView');
</script>
```

## 🔐 Security

### **Best Practices**
- No sensitive information in client-side code
- HTTPS only in production
- Form validation on both client and server side
- Secure form submission methods

## 📞 Contact Information

**Default Contact Details (Update as needed):**
- **Phone**: 07700 900123
- **Email**: info@towerlandsdogwalkers.co.uk
- **Location**: Towerlands Park, Braintree, Essex, CM7 2YD
- **Hours**: Mon-Fri: 7am-7pm, Sat-Sun: 8am-6pm

## 📄 License

This template is free to use for commercial and personal projects. Attribution appreciated but not required.

---

**Built with ❤️ for Towerlands Dog Walkers**

🐾 *Professional Dog Walking in Braintree, Essex* 🐾