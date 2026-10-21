/* ============================================
   SIS MONITOREO — Landing Page Scripts
   ============================================ */

(() => {
  "use strict";

  // ---------- Mobile menu ----------
  const navToggle = document.getElementById("navToggle");
  const navLinks = document.getElementById("navLinks");
  const body = document.body;

  navToggle.addEventListener("click", () => {
    const isOpen = navLinks.classList.toggle("open");
    navToggle.setAttribute("aria-expanded", isOpen);
    body.style.overflow = isOpen ? "hidden" : "";
  });

  // Close menu when clicking a link
  document.querySelectorAll(".nav-link").forEach((link) => {
    link.addEventListener("click", () => {
      navLinks.classList.remove("open");
      navToggle.setAttribute("aria-expanded", "false");
      body.style.overflow = "";
    });
  });

  // ---------- Navbar scroll effect ----------
  const navbar = document.getElementById("navbar");
  let lastScrollY = window.scrollY;

  window.addEventListener("scroll", () => {
    if (window.scrollY > 40) {
      navbar.classList.add("scrolled");
    } else {
      navbar.classList.remove("scrolled");
    }
    lastScrollY = window.scrollY;
  });

  // ---------- FAQ accordion ----------
  document.querySelectorAll(".faq-question").forEach((btn) => {
    btn.addEventListener("click", () => {
      const expanded = btn.getAttribute("aria-expanded") === "true";
      const answer = btn.nextElementSibling;

      // Close all other answers in this section
      document.querySelectorAll(".faq-answer").forEach((a) => {
        a.hidden = true;
      });
      document
        .querySelectorAll(".faq-question")
        .forEach((b) => b.setAttribute("aria-expanded", "false"));

      if (!expanded) {
        answer.hidden = false;
        btn.setAttribute("aria-expanded", "true");
      }
    });
  });

  // ---------- Intersection Observer reveal ----------
  const observerOptions = {
    threshold: 0.12,
    rootMargin: "0px 0px -60px 0px",
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("active");
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);

  document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));

  // Mark feature cards, steps, pricing cards, faq items as reveal elements
  const revealSelectors = [
    ".feature-card",
    ".step",
    ".pricing-card",
    ".faq-item",
    ".cta-card",
    ".dashboard-frame",
  ];
  revealSelectors.forEach((sel) => {
    document.querySelectorAll(sel).forEach((el) => {
      el.classList.add("reveal");
    });
  });

  // ---------- Simple contact/demo form handling (if added later) ----------
  const forms = document.querySelectorAll("form");
  forms.forEach((form) => {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const btn = form.querySelector("button[type='submit']");
      const originalText = btn ? btn.innerText : "";
      if (btn) {
        btn.innerText = "Enviando…";
        btn.disabled = true;
        setTimeout(() => {
          btn.innerText = "¡Listo!";
          setTimeout(() => {
            btn.innerText = originalText;
            btn.disabled = false;
            form.reset();
          }, 1400);
        }, 900);
      }
    });
  });
})();