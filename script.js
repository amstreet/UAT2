/* ==========================================================================
   Timothy Ehrlich, MD — Alternative Design Scripts
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {

  // ---------- Navbar scroll effect ----------
  const navbar = document.getElementById('navbar');

  const handleScroll = () => {
    if (window.scrollY > 20) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
  };

  window.addEventListener('scroll', handleScroll, { passive: true });
  handleScroll();

  // ---------- Mobile nav toggle ----------
  const navToggle = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');

  navToggle.addEventListener('click', () => {
    navToggle.classList.toggle('active');
    navLinks.classList.toggle('open');
    document.body.style.overflow = navLinks.classList.contains('open') ? 'hidden' : '';
  });

  navLinks.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      navToggle.classList.remove('active');
      navLinks.classList.remove('open');
      document.body.style.overflow = '';
    });
  });

  // ---------- Rotating hero word ----------
  const words = ['name', 'story', 'goals', 'health'];
  const rotatingWord = document.getElementById('rotatingWord');
  let wordIndex = 0;

  if (rotatingWord) {
    setInterval(() => {
      rotatingWord.classList.add('fade');
      setTimeout(() => {
        wordIndex = (wordIndex + 1) % words.length;
        rotatingWord.textContent = words[wordIndex];
        rotatingWord.classList.remove('fade');
      }, 400);
    }, 3000);
  }

  // ---------- Smooth scroll for anchor links ----------
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
      const target = document.querySelector(anchor.getAttribute('href'));
      if (target) {
        e.preventDefault();
        const navHeight = navbar.offsetHeight;
        const targetPos = target.getBoundingClientRect().top + window.scrollY - navHeight - 20;
        window.scrollTo({ top: targetPos, behavior: 'smooth' });
      }
    });
  });

  // ---------- Scroll reveal animations ----------
  const revealElements = document.querySelectorAll(
    '.service-card, .timeline-step, .pricing-card, .comp-card, .about-layout, .contact-layout, .hero-quote-card, .hero-stats'
  );

  revealElements.forEach(el => el.classList.add('reveal'));

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry, index) => {
      if (entry.isIntersecting) {
        // Stagger siblings for a cascading effect
        const siblings = entry.target.parentElement.querySelectorAll('.reveal');
        let delay = 0;
        siblings.forEach(sibling => {
          if (sibling === entry.target) {
            setTimeout(() => entry.target.classList.add('visible'), delay);
          }
          delay += 80;
        });
        if (delay === 0) {
          entry.target.classList.add('visible');
        }
        observer.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.08,
    rootMargin: '0px 0px -30px 0px'
  });

  revealElements.forEach(el => observer.observe(el));

  // ---------- Contact form ----------
  const contactForm = document.getElementById('contactForm');

  if (contactForm) {
    contactForm.addEventListener('submit', (e) => {
      e.preventDefault();

      const formData = new FormData(contactForm);
      const data = Object.fromEntries(formData);

      const interests = [];
      contactForm.querySelectorAll('input[name="interest"]:checked').forEach(cb => {
        interests.push(cb.value);
      });
      data.interests = interests;

      console.log('Form submission:', data);

      const formWrap = contactForm.parentElement;
      formWrap.innerHTML = `
        <div class="form-success">
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
          <h3>Message Sent</h3>
          <p>Dr. Ehrlich will personally review your inquiry and get back to you shortly.</p>
        </div>
      `;
    });
  }

});
