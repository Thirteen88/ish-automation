// Mobile Navigation Toggle
const hamburger = document.querySelector('.hamburger');
const navMenu = document.querySelector('.nav-menu');
const navLinks = document.querySelectorAll('.nav-menu a');

// Toggle mobile menu
hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('active');
    navMenu.classList.toggle('active');
});

// Close mobile menu when clicking on a link
navLinks.forEach(link => {
    link.addEventListener('click', () => {
        hamburger.classList.remove('active');
        navMenu.classList.remove('active');
    });
});

// Header scroll effect
const header = document.querySelector('.header');
let lastScroll = 0;

window.addEventListener('scroll', () => {
    const currentScroll = window.pageYOffset;

    if (currentScroll > 100) {
        header.style.background = 'rgba(255, 255, 255, 0.95)';
        header.style.backdropFilter = 'blur(10px)';
    } else {
        header.style.background = '#ffffff';
        header.style.backdropFilter = 'none';
    }

    lastScroll = currentScroll;
});

// Smooth scrolling for navigation links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            const offsetTop = target.offsetTop - 80; // Account for fixed header
            window.scrollTo({
                top: offsetTop,
                behavior: 'smooth'
            });
        }
    });
});

// Form submission
const bookingForm = document.getElementById('bookingForm');
const successMessage = document.querySelector('.success-message');

if (bookingForm) {
    bookingForm.addEventListener('submit', function(e) {
        e.preventDefault();

        // Add loading state
        const submitButton = this.querySelector('button[type="submit"]');
        const originalText = submitButton.textContent;
        submitButton.textContent = 'Sending...';
        submitButton.disabled = true;
        this.classList.add('loading');

        // Get form data
        const formData = new FormData(this);
        const data = Object.fromEntries(formData);

        // Simulate form submission (replace with actual form submission)
        setTimeout(() => {
            console.log('Form submitted:', data);

            // Show success message
            if (successMessage) {
                successMessage.textContent = 'Thank you for your booking request! We will contact you within 24 hours to confirm.';
                successMessage.classList.add('show');
            }

            // Reset form
            this.reset();

            // Reset button
            submitButton.textContent = originalText;
            submitButton.disabled = false;
            this.classList.remove('loading');

            // Hide success message after 5 seconds
            setTimeout(() => {
                if (successMessage) {
                    successMessage.classList.remove('show');
                }
            }, 5000);

        }, 2000);
    });
}

// Intersection Observer for animations
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

// Observe elements for animation
document.addEventListener('DOMContentLoaded', () => {
    const animateElements = document.querySelectorAll('.service-card, .pricing-card, .feature, .contact-item');

    animateElements.forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(el);
    });
});

// Parallax effect for hero section
window.addEventListener('scroll', () => {
    const scrolled = window.pageYOffset;
    const hero = document.querySelector('.hero');
    if (hero) {
        hero.style.transform = `translateY(${scrolled * 0.5}px)`;
    }
});

// Form validation
function validateForm(form) {
    let isValid = true;
    const inputs = form.querySelectorAll('input[required], select[required], textarea[required]');

    inputs.forEach(input => {
        if (!input.value.trim()) {
            showError(input, 'This field is required');
            isValid = false;
        } else {
            clearError(input);
        }

        // Email validation
        if (input.type === 'email' && input.value) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(input.value)) {
                showError(input, 'Please enter a valid email address');
                isValid = false;
            }
        }

        // Phone validation
        if (input.type === 'tel' && input.value) {
            const phoneRegex = /^[\d\s\-\+\(\)]+$/;
            if (!phoneRegex.test(input.value)) {
                showError(input, 'Please enter a valid phone number');
                isValid = false;
            }
        }
    });

    return isValid;
}

function showError(input, message) {
    clearError(input);
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    errorDiv.style.color = '#ff6b35';
    errorDiv.style.fontSize = '0.875rem';
    errorDiv.style.marginTop = '0.5rem';
    input.parentNode.appendChild(errorDiv);
    input.style.borderColor = '#ff6b35';
}

function clearError(input) {
    const errorDiv = input.parentNode.querySelector('.error-message');
    if (errorDiv) {
        errorDiv.remove();
    }
    input.style.borderColor = '';
}

// Add error styles to CSS
const style = document.createElement('style');
style.textContent = `
    .error-message {
        animation: fadeInUp 0.3s ease;
    }

    input:invalid,
    select:invalid,
    textarea:invalid {
        border-color: #ff6b35;
    }

    input:valid,
    select:valid,
    textarea:valid {
        border-color: #4caf50;
    }
`;
document.head.appendChild(style);

// Service type price calculation
const serviceSelect = document.getElementById('service');
if (serviceSelect) {
    serviceSelect.addEventListener('change', function() {
        const prices = {
            'individual-walk': '£15',
            'individual-walk-60': '£25',
            'group-walk': '£12',
            'pet-sitting': '£20'
        };

        const selectedPrice = prices[this.value];
        if (selectedPrice) {
            // Update any price display if needed
            console.log(`Selected service price: ${selectedPrice}`);
        }
    });
}

// Current year for footer
const currentYear = new Date().getFullYear();
const footerYearElements = document.querySelectorAll('.footer-bottom p');
footerYearElements.forEach(el => {
    if (el.textContent.includes('2024')) {
        el.textContent = el.textContent.replace('2024', currentYear);
    }
});

// Back to top button
const backToTopButton = document.createElement('button');
backToTopButton.innerHTML = '<i class="fas fa-arrow-up"></i>';
backToTopButton.className = 'back-to-top';
backToTopButton.style.cssText = `
    position: fixed;
    bottom: 30px;
    right: 30px;
    width: 50px;
    height: 50px;
    background: var(--accent-color);
    color: white;
    border: none;
    border-radius: 50%;
    cursor: pointer;
    display: none;
    align-items: center;
    justify-content: center;
    font-size: 1.2rem;
    box-shadow: var(--shadow-medium);
    transition: var(--transition);
    z-index: 1000;
`;

document.body.appendChild(backToTopButton);

window.addEventListener('scroll', () => {
    if (window.pageYOffset > 300) {
        backToTopButton.style.display = 'flex';
    } else {
        backToTopButton.style.display = 'none';
    }
});

backToTopButton.addEventListener('click', () => {
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
});

backToTopButton.addEventListener('mouseenter', () => {
    backToTopButton.style.transform = 'scale(1.1)';
    backToTopButton.style.background = '#ff5722';
});

backToTopButton.addEventListener('mouseleave', () => {
    backToTopButton.style.transform = 'scale(1)';
    backToTopButton.style.background = 'var(--accent-color)';
});

// Loading animation
window.addEventListener('load', () => {
    document.body.style.opacity = '0';
    document.body.style.transition = 'opacity 0.5s ease';

    setTimeout(() => {
        document.body.style.opacity = '1';
    }, 100);
});

// Testimonial slider (if needed in future)
function initTestimonialSlider() {
    // Placeholder for future testimonial functionality
    console.log('Testimonial slider initialized');
}

// Google Maps integration (placeholder)
function initMap() {
    // Placeholder for Google Maps integration
    console.log('Map initialized for Towerlands Park, Braintree, Essex');
}

// Analytics tracking (placeholder)
function trackEvent(eventName, properties = {}) {
    // Placeholder for analytics tracking
    console.log('Event tracked:', eventName, properties);
}

// Track button clicks
document.querySelectorAll('button, .btn-primary, .btn-secondary').forEach(button => {
    button.addEventListener('click', function() {
        const buttonText = this.textContent.trim();
        trackEvent('button_click', {
            button_text: buttonText,
            page: window.location.pathname
        });
    });
});

// Track form interactions
if (bookingForm) {
    const inputs = bookingForm.querySelectorAll('input, select, textarea');
    inputs.forEach(input => {
        input.addEventListener('focus', () => {
            trackEvent('form_field_focus', {
                field_name: input.name,
                field_type: input.type
            });
        });
    });
}

// Emergency contact functionality
function addEmergencyContact() {
    const emergencyInfo = `
        🚨 Emergency Contact Information:
        Phone: 07700 900123
        Email: info@towerlandsdogwalkers.co.uk

        In case of emergency with your dog, please contact us immediately.
    `;
    console.log(emergencyInfo);
}

// Weather API integration (placeholder)
function getWeatherForecast() {
    // Placeholder for weather API integration
    console.log('Weather forecast would be displayed here');
}

// Local storage for form data
function saveFormData() {
    const formData = {
        name: document.getElementById('name')?.value,
        email: document.getElementById('email')?.value,
        phone: document.getElementById('phone')?.value,
        service: document.getElementById('service')?.value
    };

    localStorage.setItem('dogWalkerFormData', JSON.stringify(formData));
}

function loadFormData() {
    const savedData = localStorage.getItem('dogWalkerFormData');
    if (savedData) {
        const formData = JSON.parse(savedData);

        Object.keys(formData).forEach(key => {
            const input = document.getElementById(key);
            if (input && formData[key]) {
                input.value = formData[key];
            }
        });
    }
}

// Load saved form data on page load
document.addEventListener('DOMContentLoaded', () => {
    loadFormData();

    // Save form data on input
    if (bookingForm) {
        const inputs = bookingForm.querySelectorAll('input, select');
        inputs.forEach(input => {
            input.addEventListener('input', saveFormData);
        });
    }
});

// Print functionality
function printPage() {
    window.print();
}

// Keyboard navigation
document.addEventListener('keydown', (e) => {
    // Escape key closes mobile menu
    if (e.key === 'Escape') {
        hamburger.classList.remove('active');
        navMenu.classList.remove('active');
    }

    // Ctrl+Enter submits form when in any input field
    if (e.ctrlKey && e.key === 'Enter') {
        const activeElement = document.activeElement;
        if (activeElement && activeElement.form) {
            activeElement.form.dispatchEvent(new Event('submit'));
        }
    }
});

console.log('🐕 Towerlands Dog Walkers website loaded successfully!');