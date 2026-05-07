/* ==========================================================================
   Timothy Ehrlich, MD — Site Scripts
   ========================================================================== */

const SITE_DATA_URL = 'site-data.json';
const LOCAL_DRAFT_KEY = 'siteData.draft';

function getByPath(obj, path) {
  if (!obj || !path) return undefined;
  return path.split('.').reduce((acc, key) => {
    if (acc == null) return undefined;
    return acc[key];
  }, obj);
}

async function loadSiteData() {
  try {
    const res = await fetch(SITE_DATA_URL, { cache: 'no-store' });
    if (res.ok) return await res.json();
  } catch (_) { /* fall through */ }
  // Fallback: a draft saved by the admin tool in this browser
  try {
    const draft = localStorage.getItem(LOCAL_DRAFT_KEY);
    if (draft) return JSON.parse(draft);
  } catch (_) { /* ignore */ }
  return null;
}

function applyContent(data) {
  if (!data) return;

  // Plain text bindings: data-content="path.to.value"
  // Optional: data-content-attr="alt|placeholder|content" to set an attribute instead of textContent
  document.querySelectorAll('[data-content]').forEach(el => {
    const path = el.getAttribute('data-content');
    const value = getByPath(data, path);
    if (value === undefined || value === null) return;
    const attrName = el.getAttribute('data-content-attr');
    if (attrName) {
      el.setAttribute(attrName, value);
    } else {
      el.textContent = value;
    }
  });

  // List bindings: data-content-list="path.to.array" — replace children with one <li> per item
  document.querySelectorAll('[data-content-list]').forEach(el => {
    const path = el.getAttribute('data-content-list');
    const items = getByPath(data, path);
    if (!Array.isArray(items)) return;
    el.innerHTML = '';
    items.forEach(text => {
      const li = document.createElement('li');
      li.textContent = text;
      el.appendChild(li);
    });
  });

  // Pricing card variant: hide $/period if no number, hide label if a number is present.
  // We do this after binding so the visibility reflects the resolved content.
  document.querySelectorAll('.pricing-amount').forEach(amt => {
    const num = amt.querySelector('.pricing-number');
    const per = amt.querySelector('.pricing-period');
    const lbl = amt.querySelector('.pricing-label');
    const hasNumber = num && num.textContent.trim().length > 0;
    if (num) num.style.display = hasNumber ? '' : 'none';
    if (per) per.style.display = hasNumber ? '' : 'none';
    if (lbl) lbl.style.display = hasNumber ? 'none' : '';
  });

  // Hide the featured pricing badge if the JSON sets featured=false on that card.
  // (Admin form drives which card gets the .pricing-featured class — we just sync the badge visibility.)
  if (data.pricing && Array.isArray(data.pricing.cards)) {
    const cards = document.querySelectorAll('.pricing-card');
    data.pricing.cards.forEach((card, i) => {
      const el = cards[i];
      if (!el) return;
      el.classList.toggle('pricing-featured', !!card.featured);
      const badge = el.querySelector('.pricing-badge');
      if (badge) badge.style.display = card.featured ? '' : 'none';
      // If a non-default card becomes featured, also surface the badge text
    });
    // Ensure exactly the cards flagged featured have a visible badge; if none of the
    // cards have a .pricing-badge yet, inject one for the featured one.
    cards.forEach((el, i) => {
      const card = data.pricing.cards[i];
      if (!card || !card.featured) return;
      let badge = el.querySelector('.pricing-badge');
      if (!badge) {
        badge = document.createElement('div');
        badge.className = 'pricing-badge';
        badge.textContent = data.pricing.featuredBadge || 'Most Popular';
        el.prepend(badge);
      } else {
        badge.textContent = data.pricing.featuredBadge || badge.textContent;
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', async () => {

  // ---------- Hydrate from site-data.json (with localStorage fallback) ----------
  const data = await loadSiteData();
  applyContent(data);

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
  const fallbackWords = ['name', 'story', 'goals', 'health'];
  const words = (data && data.hero && Array.isArray(data.hero.rotatingWords) && data.hero.rotatingWords.length)
    ? data.hero.rotatingWords
    : fallbackWords;
  const rotatingWord = document.getElementById('rotatingWord');
  let wordIndex = 0;

  if (rotatingWord) {
    rotatingWord.textContent = words[0];
    if (words.length > 1) {
      setInterval(() => {
        rotatingWord.classList.add('fade');
        setTimeout(() => {
          wordIndex = (wordIndex + 1) % words.length;
          rotatingWord.textContent = words[wordIndex];
          rotatingWord.classList.remove('fade');
        }, 400);
      }, 3000);
    }
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
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
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
      const dataOut = Object.fromEntries(formData);

      const interests = [];
      contactForm.querySelectorAll('input[name="interest"]:checked').forEach(cb => {
        interests.push(cb.value);
      });
      dataOut.interests = interests;

      console.log('Form submission:', dataOut);

      const successTitle = (data && data.contact && data.contact.form && data.contact.form.successTitle)
        || 'Message Sent';
      const successMessage = (data && data.contact && data.contact.form && data.contact.form.successMessage)
        || 'Dr. Ehrlich will personally review your inquiry and get back to you shortly.';

      const formWrap = contactForm.parentElement;
      const titleEl = document.createElement('h3');
      titleEl.textContent = successTitle;
      const msgEl = document.createElement('p');
      msgEl.textContent = successMessage;

      formWrap.innerHTML = `
        <div class="form-success">
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
        </div>
      `;
      const wrap = formWrap.querySelector('.form-success');
      wrap.appendChild(titleEl);
      wrap.appendChild(msgEl);
    });
  }

});
