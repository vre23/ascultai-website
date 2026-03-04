/**
 * help-center.js
 * -----------------------------------------------------------------------
 * Unified Help Center page logic for AscultAI.
 *
 * Sections: Ghiduri (Pornire Rapida + Optimizare), FAQ, Explicatii, Audit.
 * Features: hash routing, guide chapter navigation with progress tracking,
 *           FAQ accordion with scroll-to + IntersectionObserver highlighting,
 *           collapsible sidebar categories, mobile sidebar, localStorage
 *           progress persistence with backward compatibility.
 *
 * Wrapped in a single IIFE -- no globals leak.
 * -----------------------------------------------------------------------
 */
(function () {
  'use strict';

  // =====================================================================
  //  CONSTANTS & CONFIG
  // =====================================================================

  /** Guide definitions keyed by prefix. */
  var GUIDES = {
    pr: {
      prefix: 'pr',
      sectionId: 'section-pornire-rapida',
      storageKey: 'ascultai-guide-pornire-rapida-completed',
      totalChapters: 6,
      hashSegment: 'pornire-rapida'
    },
    oa: {
      prefix: 'oa',
      sectionId: 'section-optimizare',
      storageKey: 'ascultai-guide-optimizarea-acuratetii-completed',
      totalChapters: 8,
      hashSegment: 'optimizare'
    }
  };

  /** Mapping from old (standalone page) chapter IDs to new prefixed IDs. */
  var OLD_TO_NEW_PR = {};
  var OLD_TO_NEW_OA = {};
  (function buildMappings() {
    var i;
    for (i = 1; i <= GUIDES.pr.totalChapters; i++) {
      OLD_TO_NEW_PR['chapter-' + i] = 'pr-chapter-' + i;
    }
    for (i = 1; i <= GUIDES.oa.totalChapters; i++) {
      OLD_TO_NEW_OA['chapter-' + i] = 'oa-chapter-' + i;
    }
  })();

  /** Mobile breakpoint (matches CSS @media max-width: 960px). */
  var MOBILE_BP = 960;

  // =====================================================================
  //  UTILITY HELPERS
  // =====================================================================

  /** Shorthand for document.getElementById. */
  function $(id) {
    return document.getElementById(id);
  }

  /** Shorthand for querySelectorAll on a root (default: document). */
  function $$(sel, root) {
    return (root || document).querySelectorAll(sel);
  }

  /** True when viewport width <= MOBILE_BP. */
  function isMobile() {
    return window.innerWidth <= MOBILE_BP;
  }

  // =====================================================================
  //  1. LOCALSTORAGE PROGRESS TRACKING
  // =====================================================================

  /**
   * Migrate old chapter IDs stored by the standalone guide pages to the
   * new prefixed format used by the unified help center.
   * Old pages stored IDs like 'chapter-1'; new page uses 'pr-chapter-1'.
   */
  function migrateOldProgress() {
    Object.keys(GUIDES).forEach(function (prefix) {
      var guide = GUIDES[prefix];
      var mapping = prefix === 'pr' ? OLD_TO_NEW_PR : OLD_TO_NEW_OA;
      var raw;

      try {
        raw = JSON.parse(localStorage.getItem(guide.storageKey));
      } catch (_) {
        raw = null;
      }

      if (!Array.isArray(raw) || raw.length === 0) return;

      var changed = false;
      var migrated = raw.map(function (id) {
        if (mapping[id]) {
          changed = true;
          return mapping[id];
        }
        return id;
      });

      if (changed) {
        // Deduplicate
        var unique = migrated.filter(function (v, i, a) {
          return a.indexOf(v) === i;
        });
        localStorage.setItem(guide.storageKey, JSON.stringify(unique));
      }
    });
  }

  /** Return array of completed chapter IDs for a guide. */
  function getCompleted(guide) {
    try {
      return JSON.parse(localStorage.getItem(guide.storageKey)) || [];
    } catch (_) {
      return [];
    }
  }

  /** Mark a single chapter ID as completed for a guide. */
  function markCompleted(guide, chapterId) {
    var completed = getCompleted(guide);
    if (completed.indexOf(chapterId) === -1) {
      completed.push(chapterId);
      localStorage.setItem(guide.storageKey, JSON.stringify(completed));
    }
  }

  /**
   * Update sidebar link completed classes for a given guide prefix.
   * Sidebar links are expected to have [data-chapter="pr-chapter-1"] etc.
   */
  function updateCompletedUI(guide) {
    var completed = getCompleted(guide);
    var links = $$('.hc-sidebar-link[data-guide="' + guide.prefix + '"]');
    links.forEach(function (link) {
      var ch = link.getAttribute('data-chapter');
      if (completed.indexOf(ch) !== -1) {
        link.classList.add('completed');
      } else {
        link.classList.remove('completed');
      }
    });
  }

  // =====================================================================
  //  2. SECTION NAVIGATION
  // =====================================================================

  /**
   * Show a single .hc-section by ID, hiding all others.
   * Also updates sidebar active states for top-level categories.
   */
  function showSection(sectionId) {
    var sections = $$('.hc-section');
    sections.forEach(function (sec) {
      if (sec.id === sectionId) {
        sec.classList.add('active');
      } else {
        sec.classList.remove('active');
      }
    });

    // Determine which sidebar category should be marked active.
    // Map section IDs to category data-category values.
    var sectionToCategory = {
      'section-pornire-rapida': 'ghiduri',
      'section-optimizare': 'ghiduri',
      'section-faq': 'faq',
      'section-explicatii': 'explicatii'
    };

    var activeCat = sectionToCategory[sectionId] || '';

    // Update category-level active states
    var catHeaders = $$('.hc-category-header');
    catHeaders.forEach(function (header) {
      var cat = header.getAttribute('data-category');
      if (cat === activeCat) {
        header.classList.add('active');
      } else {
        header.classList.remove('active');
      }
    });

    // Scroll content area to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // =====================================================================
  //  3. GUIDE CHAPTER NAVIGATION
  // =====================================================================

  /**
   * Show a guide section and scroll to a specific chapter.
   * All chapters are visible at once (no step-by-step).
   *
   * @param {string} guidePrefix - 'pr' or 'oa'
   * @param {number} chapterIndex - 0-based chapter index
   * @param {boolean} [skipHashUpdate] - if true, do not update the URL hash
   */
  function showGuideChapter(guidePrefix, chapterIndex, skipHashUpdate) {
    var guide = GUIDES[guidePrefix];
    if (!guide) return;

    var sectionEl = $(guide.sectionId);
    if (!sectionEl) return;

    var chapters = $$('.guide-chapter', sectionEl);
    var total = chapters.length;
    if (chapterIndex < 0 || chapterIndex >= total) return;

    // Ensure this guide's section is visible
    showSection(guide.sectionId);

    // Update sidebar links within this guide's subgroup
    var sidebarLinks = $$('.hc-sidebar-link[data-guide="' + guidePrefix + '"]');
    sidebarLinks.forEach(function (link) {
      link.classList.remove('active');
    });
    if (sidebarLinks[chapterIndex]) {
      sidebarLinks[chapterIndex].classList.add('active');
    }

    // Update URL hash
    if (!skipHashUpdate) {
      var hashStr = '#ghiduri/' + guide.hashSegment + '/chapter-' + (chapterIndex + 1);
      history.replaceState(null, '', hashStr);
    }

    // Auto-expand the correct sidebar category and subgroup
    autoExpandSidebar(guidePrefix);

    // Scroll to the chapter (or top if chapter 0)
    if (chapterIndex === 0) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      setTimeout(function () {
        chapters[chapterIndex].scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
    }
  }

  /** Wire prev/next buttons for a guide. */
  function wireGuideNavButtons(guidePrefix) {
    var guide = GUIDES[guidePrefix];
    var sectionEl = $(guide.sectionId);
    if (!sectionEl) return;

    var chapters = $$('.guide-chapter', sectionEl);
    var prevBtn = $(guidePrefix + '-prevBtn');
    var nextBtn = $(guidePrefix + '-nextBtn');

    function getActiveIndex() {
      for (var i = 0; i < chapters.length; i++) {
        if (chapters[i].classList.contains('active')) return i;
      }
      return 0;
    }

    if (prevBtn) {
      prevBtn.addEventListener('click', function (e) {
        e.preventDefault();
        var idx = getActiveIndex();
        if (idx > 0) showGuideChapter(guidePrefix, idx - 1);
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', function (e) {
        e.preventDefault();
        var idx = getActiveIndex();
        if (idx < chapters.length - 1) showGuideChapter(guidePrefix, idx + 1);
      });
    }
  }

  // =====================================================================
  //  4. SIDEBAR EXPAND / COLLAPSE
  // =====================================================================

  /**
   * Toggle a top-level sidebar category open/closed.
   * @param {HTMLElement} headerEl - the .hc-category-header element
   */
  function toggleCategory(headerEl) {
    var parent = headerEl.closest('.hc-category');
    if (!parent) return;

    var isOpen = parent.classList.contains('open');
    var content = parent.querySelector('.hc-category-content');

    // On mobile, close other categories when opening one
    if (!isOpen && isMobile()) {
      var allCats = $$('.hc-category');
      allCats.forEach(function (cat) {
        if (cat !== parent && cat.classList.contains('open')) {
          cat.classList.remove('open');
          var c = cat.querySelector('.hc-category-content');
          if (c) c.style.maxHeight = null;
        }
      });
    }

    parent.classList.toggle('open');
    if (content) {
      if (parent.classList.contains('open')) {
        content.style.maxHeight = content.scrollHeight + 'px';
        // After transition, allow auto height for dynamic children
        var onEnd = function () {
          content.style.maxHeight = 'none';
          content.removeEventListener('transitionend', onEnd);
        };
        content.addEventListener('transitionend', onEnd);
      } else {
        // Force reflow so transition fires
        content.style.maxHeight = content.scrollHeight + 'px';
        // eslint-disable-next-line no-unused-expressions
        content.offsetHeight; // trigger reflow
        content.style.maxHeight = null;
      }
    }
  }

  /**
   * Toggle a sidebar sub-group (e.g. Pornire Rapida, Optimizare under Ghiduri).
   * @param {HTMLElement} headerEl - the .hc-subgroup-header element
   */
  function toggleSubgroup(headerEl) {
    var parent = headerEl.closest('.hc-subgroup');
    if (!parent) return;

    var isOpen = parent.classList.contains('open');
    var content = parent.querySelector('.hc-subgroup-content');

    parent.classList.toggle('open');
    if (content) {
      if (parent.classList.contains('open')) {
        content.style.maxHeight = content.scrollHeight + 'px';
        var onEnd = function () {
          content.style.maxHeight = 'none';
          content.removeEventListener('transitionend', onEnd);
        };
        content.addEventListener('transitionend', onEnd);
      } else {
        content.style.maxHeight = content.scrollHeight + 'px';
        // eslint-disable-next-line no-unused-expressions
        content.offsetHeight;
        content.style.maxHeight = null;
      }
    }
  }

  /**
   * Auto-expand the correct sidebar category for a given
   * context (guide prefix, 'faq', or 'explicatii').
   */
  function autoExpandSidebar(context) {
    var targetCategory = null;

    if (context === 'pr' || context === 'oa') {
      targetCategory = 'ghiduri';
    } else if (context === 'faq') {
      targetCategory = 'faq';
    } else if (context === 'explicatii') {
      targetCategory = 'explicatii';
    }

    if (targetCategory) {
      ensureCategoryOpen(targetCategory);
    }

    // Also update guide links active state
    if (context === 'pr' || context === 'oa') {
      updateGuideLinksActive(context);
    }
  }

  // =====================================================================
  //  5. FAQ ACCORDION
  // =====================================================================

  /** Initialize FAQ accordion: click toggles, close siblings. */
  function initFaqAccordion() {
    var questions = $$('.faq-question');
    questions.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var item = btn.closest('.faq-item');
        if (!item) return;

        var wasOpen = item.classList.contains('open');

        // Close other items in the same .faq-category
        var category = item.closest('.faq-category');
        if (category) {
          var siblings = $$('.faq-item', category);
          siblings.forEach(function (sib) {
            sib.classList.remove('open');
            var q = sib.querySelector('.faq-question');
            if (q) q.setAttribute('aria-expanded', 'false');
          });
        }

        // Toggle the clicked item (re-open if it was closed)
        if (!wasOpen) {
          item.classList.add('open');
          btn.setAttribute('aria-expanded', 'true');
        }
      });
    });
  }

  // =====================================================================
  //  6. FAQ SIDEBAR SCROLL-TO & INTERSECTION OBSERVER
  // =====================================================================

  /**
   * Wire FAQ sidebar links to scroll to corresponding .faq-category
   * elements within the FAQ section.
   */
  function initFaqSidebarScrollTo() {
    var faqSidebarLinks = $$('.hc-sidebar-link[data-faq-category]');
    faqSidebarLinks.forEach(function (link) {
      link.addEventListener('click', function (e) {
        e.preventDefault();

        var targetId = link.getAttribute('data-faq-category');
        var targetEl = $(targetId);
        if (!targetEl) return;

        // Make sure we are on the FAQ section
        showSection('section-faq');
        autoExpandSidebar('faq');

        // Update hash
        history.replaceState(null, '', '#faq/' + targetId);

        // Mark this link as active
        faqSidebarLinks.forEach(function (l) { l.classList.remove('active'); });
        link.classList.add('active');

        // Scroll to the category element
        setTimeout(function () {
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 50);

        // Close mobile sidebar if needed
        if (isMobile()) closeMobileSidebar();
      });
    });
  }

  /**
   * Set up IntersectionObserver to highlight the active FAQ category
   * in the sidebar as the user scrolls through the FAQ section.
   */
  function initFaqScrollHighlight() {
    var faqCategories = $$('#section-faq .faq-category');
    if (faqCategories.length === 0) return;

    var faqSidebarLinks = $$('.hc-sidebar-link[data-faq-category]');

    var observer = new IntersectionObserver(function (entries) {
      // Only update if the FAQ section is visible
      var faqSection = $('section-faq');
      if (!faqSection || !faqSection.classList.contains('active')) return;

      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          var id = entry.target.id;
          faqSidebarLinks.forEach(function (link) {
            if (link.getAttribute('data-faq-category') === id) {
              link.classList.add('active');
            } else {
              link.classList.remove('active');
            }
          });
        }
      });
    }, {
      root: null,
      rootMargin: '-10% 0px -70% 0px',
      threshold: 0
    });

    faqCategories.forEach(function (cat) {
      observer.observe(cat);
    });
  }

  // =====================================================================
  //  7. MOBILE SIDEBAR
  // =====================================================================

  var mobileSidebarOpen = false;

  function openMobileSidebar() {
    var sidebar = document.querySelector('.hc-sidebar');
    var overlay = document.querySelector('.hc-sidebar-overlay');
    if (!sidebar) return;

    sidebar.classList.add('open');
    if (overlay) overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
    mobileSidebarOpen = true;
  }

  function closeMobileSidebar() {
    var sidebar = document.querySelector('.hc-sidebar');
    var overlay = document.querySelector('.hc-sidebar-overlay');
    if (!sidebar) return;

    sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('active');
    document.body.style.overflow = '';
    mobileSidebarOpen = false;
  }

  function initMobileSidebar() {
    var toggleBtn = document.querySelector('.hc-sidebar-toggle');
    var closeBtn = document.querySelector('.hc-sidebar-close');
    var overlay = document.querySelector('.hc-sidebar-overlay');

    if (toggleBtn) {
      toggleBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (mobileSidebarOpen) {
          closeMobileSidebar();
        } else {
          openMobileSidebar();
        }
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        closeMobileSidebar();
      });
    }

    if (overlay) {
      overlay.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        closeMobileSidebar();
      });
    }

    // Escape key
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && mobileSidebarOpen) {
        closeMobileSidebar();
      }
    });
  }

  // =====================================================================
  //  8. HASH ROUTING
  // =====================================================================

  /**
   * Parse a hash string and navigate to the correct section/chapter.
   *
   * Supported formats:
   *   #ghiduri/pornire-rapida/chapter-3
   *   #ghiduri/optimizare/chapter-5
   *   #faq
   *   #faq/securitate
   *   #explicatii
   *   #explicatii/pacienti
   *
   * @param {string} hash - the location hash (with or without leading #)
   * @returns {boolean} true if a valid route was found and navigated to
   */
  function parseAndNavigate(hash) {
    if (!hash) return false;

    // Strip leading #
    hash = hash.replace(/^#/, '');
    if (!hash) return false;

    var parts = hash.split('/');
    var root = parts[0];

    // --- Ghiduri ---
    if (root === 'ghiduri') {
      var guideSeg = parts[1] || 'pornire-rapida';
      var prefix = guideSeg === 'optimizare' ? 'oa' : 'pr';
      var guide = GUIDES[prefix];

      showSection(guide.sectionId);
      autoExpandSidebar(prefix);
      history.replaceState(null, '', '#ghiduri/' + guide.hashSegment);
      return true;
    }

    // --- FAQ ---
    if (root === 'faq') {
      showSection('section-faq');
      autoExpandSidebar('faq');
      history.replaceState(null, '', '#' + hash);

      if (parts[1]) {
        // Scroll to a specific FAQ category
        var targetEl = $(parts[1]);
        if (targetEl) {
          setTimeout(function () {
            targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 100);
        }

        // Highlight the sidebar link
        var faqLinks = $$('.hc-sidebar-link[data-faq-category]');
        faqLinks.forEach(function (l) {
          if (l.getAttribute('data-faq-category') === parts[1]) {
            l.classList.add('active');
          } else {
            l.classList.remove('active');
          }
        });
      }
      return true;
    }

    // --- Explicatii ---
    if (root === 'explicatii') {
      showSection('section-explicatii');
      autoExpandSidebar('explicatii');
      history.replaceState(null, '', '#' + hash);

      if (parts[1]) {
        // Scroll to a sub-section within Explicatii
        var subEl = $(parts[1]) || document.querySelector('[data-explainer="' + parts[1] + '"]');
        if (subEl) {
          setTimeout(function () {
            subEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 100);
        }

        // Highlight the sidebar link
        var expLinks = $$('.hc-sidebar-link[data-explainer]');
        expLinks.forEach(function (l) {
          if (l.getAttribute('data-explainer') === parts[1]) {
            l.classList.add('active');
          } else {
            l.classList.remove('active');
          }
        });
      }
      return true;
    }

    return false;
  }

  // =====================================================================
  //  9. EVENT WIRING
  // =====================================================================

  /**
   * Ensure a category is open (never closes it).
   * Used by category/subgroup click handlers that also navigate.
   */
  function ensureCategoryOpen(categoryName) {
    var cat = document.querySelector('.hc-category[data-category="' + categoryName + '"]');
    if (cat && !cat.classList.contains('open')) {
      cat.classList.add('open');
      var content = cat.querySelector('.hc-category-content');
      if (content) content.style.maxHeight = 'none';
    }
  }

  /**
   * Ensure a subgroup is open (never closes it).
   */
  function ensureSubgroupOpen(subgroupName) {
    var sg = document.querySelector('.hc-subgroup[data-subgroup="' + subgroupName + '"]');
    if (sg && !sg.classList.contains('open')) {
      sg.classList.add('open');
      var content = sg.querySelector('.hc-subgroup-content');
      if (content) content.style.maxHeight = 'none';
    }
  }

  /** Update guide sidebar links active state based on guide prefix. */
  function updateGuideLinksActive(prefix) {
    var guideLinks = $$('.hc-sidebar-link[data-guide-link]');
    guideLinks.forEach(function (l) {
      if (l.getAttribute('data-guide-link') === prefix) {
        l.classList.add('active');
      } else {
        l.classList.remove('active');
      }
    });
  }

  /** Wire sidebar category headers (expand + navigate). */
  function wireCategoryToggles() {
    var categoryNavMap = {
      'ghiduri':     function () { ensureCategoryOpen('ghiduri'); showSection('section-pornire-rapida'); history.replaceState(null, '', '#ghiduri/pornire-rapida'); updateGuideLinksActive('pr'); },
      'faq':         function () { ensureCategoryOpen('faq'); showSection('section-faq'); history.replaceState(null, '', '#faq'); },
      'explicatii':  function () { ensureCategoryOpen('explicatii'); showSection('section-explicatii'); history.replaceState(null, '', '#explicatii'); }
    };

    var headers = $$('.hc-category-header');
    headers.forEach(function (header) {
      header.addEventListener('click', function (e) {
        e.preventDefault();
        var cat = header.getAttribute('data-category');

        // If already on this category's content, toggle the sidebar expand/collapse
        var parent = header.closest('.hc-category');
        var isOpen = parent && parent.classList.contains('open');
        var activeSection = document.querySelector('.hc-section.active');
        var isSameSection = false;

        if (cat === 'ghiduri' && activeSection && (activeSection.id === 'section-pornire-rapida' || activeSection.id === 'section-optimizare')) {
          isSameSection = true;
        } else if (cat === 'faq' && activeSection && activeSection.id === 'section-faq') {
          isSameSection = true;
        } else if (cat === 'explicatii' && activeSection && activeSection.id === 'section-explicatii') {
          isSameSection = true;
        }

        if (isOpen && isSameSection) {
          // Already viewing this section — just toggle collapse
          toggleCategory(header);
        } else {
          // Navigate to this section and ensure open
          if (categoryNavMap[cat]) {
            categoryNavMap[cat]();
          }
          if (isMobile()) closeMobileSidebar();
        }
      });
    });
  }

  /**
   * Wire sidebar guide links (Pornire Rapida / Optimizare).
   * These are simple links under the Ghiduri category, no sub-groups.
   */
  function wireGuideLinks() {
    var guideLinks = $$('.hc-sidebar-link[data-guide-link]');
    guideLinks.forEach(function (link) {
      link.addEventListener('click', function (e) {
        e.preventDefault();
        var prefix = link.getAttribute('data-guide-link');
        var guide = GUIDES[prefix];
        if (!guide) return;

        // Show the guide section
        showSection(guide.sectionId);
        ensureCategoryOpen('ghiduri');

        // Update sidebar active state
        guideLinks.forEach(function (l) { l.classList.remove('active'); });
        link.classList.add('active');

        // Update hash
        history.replaceState(null, '', '#ghiduri/' + guide.hashSegment);

        // Scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });

        if (isMobile()) closeMobileSidebar();
      });
    });
  }

  /**
   * Highlight sidebar chapter link as user scrolls through guide content.
   * Uses IntersectionObserver on .guide-chapter elements.
   */
  function initGuideScrollHighlight() {
    if (!('IntersectionObserver' in window)) return;

    Object.keys(GUIDES).forEach(function (prefix) {
      var guide = GUIDES[prefix];
      var sectionEl = $(guide.sectionId);
      if (!sectionEl) return;

      var chapters = $$('.guide-chapter', sectionEl);
      var links = $$('.hc-sidebar-link[data-guide="' + prefix + '"]');

      var observer = new IntersectionObserver(function (entries) {
        // Only highlight when this guide's section is active
        if (!sectionEl.classList.contains('active')) return;

        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            var chapterId = entry.target.id;
            links.forEach(function (l) {
              if (l.getAttribute('data-chapter') === chapterId) {
                l.classList.add('active');
              } else {
                l.classList.remove('active');
              }
            });
          }
        });
      }, { rootMargin: '-10% 0px -70% 0px', threshold: 0 });

      chapters.forEach(function (ch) {
        observer.observe(ch);
      });
    });
  }

  /** Wire Explicatii sidebar sub-section links. */
  function wireExplainerLinks() {
    var links = $$('.hc-sidebar-link[data-explainer]');
    links.forEach(function (link) {
      link.addEventListener('click', function (e) {
        e.preventDefault();
        var target = link.getAttribute('data-explainer');

        showSection('section-explicatii');
        autoExpandSidebar('explicatii');

        // Update hash
        history.replaceState(null, '', '#explicatii/' + target);

        // Mark active
        links.forEach(function (l) { l.classList.remove('active'); });
        link.classList.add('active');

        // Scroll to the sub-section
        var el = $(target) || document.querySelector('[data-explainer="' + target + '"]');
        if (el) {
          setTimeout(function () {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 50);
        }

        if (isMobile()) closeMobileSidebar();
      });
    });
  }

  /** Wire any sidebar links that navigate to a full section without sub-nav. */
  function wireSectionLinks() {
    var links = $$('.hc-sidebar-link[data-section]');
    links.forEach(function (link) {
      link.addEventListener('click', function (e) {
        e.preventDefault();
        var sectionId = link.getAttribute('data-section');

        // Determine context from section ID for sidebar expand
        var contextMap = {
          'section-pornire-rapida': 'pr',
          'section-optimizare': 'oa',
          'section-faq': 'faq',
          'section-explicatii': 'explicatii'
        };
        var context = contextMap[sectionId];

        showSection(sectionId);
        if (context) autoExpandSidebar(context);

        // Update hash based on section
        var hashMap = {
          'section-faq': '#faq',
          'section-explicatii': '#explicatii'
        };
        if (hashMap[sectionId]) {
          history.replaceState(null, '', hashMap[sectionId]);
        }

        if (isMobile()) closeMobileSidebar();
      });
    });
  }

  // =====================================================================
  //  10. INITIALIZATION
  // =====================================================================

  function init() {
    // ---- Prevent browser scroll restoration (forces top on reload) ----
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual';
    }
    window.scrollTo(0, 0);

    // ---- Migrate old localStorage data ----
    migrateOldProgress();

    // ---- Wire sidebar toggles ----
    wireCategoryToggles();

    // ---- Wire guide links ----
    wireGuideLinks();

    // ---- Wire FAQ ----
    initFaqAccordion();
    initFaqSidebarScrollTo();
    initFaqScrollHighlight();

    // ---- Wire Explicatii links ----
    wireExplainerLinks();

    // ---- Wire generic section links ----
    wireSectionLinks();

    // ---- Wire mobile sidebar ----
    initMobileSidebar();

    // ---- Parse initial hash and navigate ----
    var initialHash = window.location.hash;
    var navigated = parseAndNavigate(initialHash);

    // Default: show Pornire Rapida, chapter 1
    if (!navigated) {
      showSection('section-pornire-rapida');
      autoExpandSidebar('pr');
    }

    // ---- Listen for hash changes ----
    window.addEventListener('hashchange', function () {
      parseAndNavigate(window.location.hash);
    });
  }

  // ---- Boot ----
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
