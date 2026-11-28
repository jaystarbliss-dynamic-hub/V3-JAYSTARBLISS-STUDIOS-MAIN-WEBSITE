/**
 * Jaystarbliss Coding Lab — TurboWarp-Style Workspace Addons
 * Inspired by TurboWarp/scratch-gui, TurboWarp/scratch-vm, and TurboWarp/scratch-blocks.
 *
 * Provides:
 *  1. Stage Pause / Resume button (between Green Flag & Stop Sign) wired to Scratch VM runtime.
 *  2. Live Turbo Mode & 60 FPS indicator badge next to Stage Controls.
 *  3. TurboWarp-style "Find (Ctrl+F)" block search bar beside the Code / Costumes / Sounds tabs.
 *  4. Same-origin postMessage bridge for Advanced Runtime Settings (Turbo Mode, 60 FPS,
 *     Remove Fencing, Infinite Clones, Remove Misc Limits).
 */
(function () {
  'use strict';

  var state = {
    turboMode: false,
    fps60: false,
    removeFencing: false,
    infiniteClones: false,
    removeLimits: false,
    paused: false,
  };

  var originalStep = null;
  var originalFencing = null;
  var originalMaxClones = null;
  var originalMiscLimits = null;
  var patchedVm = null;

  function getVm() {
    return window.__CODING_LAB_VM__ || null;
  }

  function postStateToParent() {
    if (!window.parent || window.parent === window) return;
    try {
      window.parent.postMessage(
        {
          type: 'CODING_LAB_TURBO_STATE',
          state: {
            turboMode: state.turboMode,
            fps60: state.fps60,
            removeFencing: state.removeFencing,
            infiniteClones: state.infiniteClones,
            removeLimits: state.removeLimits,
            paused: state.paused,
          },
        },
        window.location.origin
      );
    } catch (_) {
      // Ignore cross-navigation errors
    }
  }

  function ensureVmHooks(vm) {
    if (!vm || !vm.runtime || patchedVm === vm) return;
    patchedVm = vm;
    var rt = vm.runtime;

    if (!originalStep && typeof rt._step === 'function') {
      originalStep = rt._step.bind(rt);
      rt._step = function codingLabPausableStep() {
        if (state.paused) return;
        return originalStep();
      };
    }

    if (rt.runtimeOptions) {
      if (originalFencing === null) originalFencing = rt.runtimeOptions.fencing;
      if (originalMaxClones === null) originalMaxClones = rt.runtimeOptions.maxClones;
      if (originalMiscLimits === null) originalMiscLimits = rt.runtimeOptions.miscLimits;
    }

    // Automatically unpause when Green Flag or Stop All runs
    if (typeof vm.greenFlag === 'function') {
      var origGreenFlag = vm.greenFlag.bind(vm);
      vm.greenFlag = function () {
        if (state.paused) setPaused(false);
        return origGreenFlag();
      };
    }
    if (typeof vm.stopAll === 'function') {
      var origStopAll = vm.stopAll.bind(vm);
      vm.stopAll = function () {
        if (state.paused) setPaused(false);
        return origStopAll();
      };
    }
  }

  function applyRuntimeSettings(next) {
    if (next && typeof next === 'object') {
      if (typeof next.turboMode === 'boolean') state.turboMode = next.turboMode;
      if (typeof next.fps60 === 'boolean') state.fps60 = next.fps60;
      if (typeof next.removeFencing === 'boolean') state.removeFencing = next.removeFencing;
      if (typeof next.infiniteClones === 'boolean') state.infiniteClones = next.infiniteClones;
      if (typeof next.removeLimits === 'boolean') state.removeLimits = next.removeLimits;
    }

    var vm = getVm();
    if (vm && vm.runtime) {
      ensureVmHooks(vm);
      var rt = vm.runtime;

      if (typeof vm.setTurboMode === 'function') {
        vm.setTurboMode(state.turboMode);
      }

      // 60 FPS vs default 30 FPS step interval
      var targetStepTime = state.fps60 ? 1000 / 60 : 1000 / 30;
      rt.currentStepTime = targetStepTime;
      if (rt._steppingInterval) {
        clearInterval(rt._steppingInterval);
        rt._steppingInterval = setInterval(rt._step, rt.currentStepTime);
      }

      if (rt.runtimeOptions) {
        rt.runtimeOptions.fencing = state.removeFencing
          ? false
          : originalFencing !== null
          ? originalFencing
          : true;
        rt.runtimeOptions.maxClones = state.infiniteClones
          ? Infinity
          : originalMaxClones !== null
          ? originalMaxClones
          : 300;
        rt.runtimeOptions.miscLimits = state.removeLimits
          ? false
          : originalMiscLimits !== null
          ? originalMiscLimits
          : true;
      }
    }

    updateBadgesUI();
    postStateToParent();
  }

  function setPaused(nextPaused) {
    var vm = getVm();
    if (vm) ensureVmHooks(vm);
    state.paused = Boolean(nextPaused);
    updatePauseButtonUI();
    postStateToParent();
  }

  // -------------------------------------------------------------------------
  // 1. TurboWarp Pause Button (between Green Flag & Stop Sign) + Status Badges
  // -------------------------------------------------------------------------
  var pauseBtnEl = null;
  var badgeWrapEl = null;

  function buildPauseSvg(isPaused) {
    if (isPaused) {
      // Play icon when currently paused
      return (
        '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">' +
        '<path d="M5.5 3.6L16.2 10L5.5 16.4Z" fill="#ffae00" stroke="#cc8a00" stroke-width="1.2" stroke-linejoin="round"/>' +
        '</svg>'
      );
    }
    // Two vertical amber bars (matching TurboWarp screenshot)
    return (
      '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">' +
      '<rect x="4.5" y="3.5" width="4" height="13" rx="1" fill="#ffae00" stroke="#cc8a00" stroke-width="1"/>' +
      '<rect x="11.5" y="3.5" width="4" height="13" rx="1" fill="#ffae00" stroke="#cc8a00" stroke-width="1"/>' +
      '</svg>'
    );
  }

  function updatePauseButtonUI() {
    if (!pauseBtnEl) return;
    pauseBtnEl.innerHTML = buildPauseSvg(state.paused);
    pauseBtnEl.title = state.paused ? 'Resume (TurboWarp Pause)' : 'Pause';
    pauseBtnEl.setAttribute('aria-label', state.paused ? 'Resume project' : 'Pause project');
    pauseBtnEl.classList.toggle('tw-pause-active', state.paused);
  }

  function updateBadgesUI() {
    if (!badgeWrapEl) return;
    var parts = [];
    if (state.turboMode) {
      parts.push(
        '<span class="tw-status-chip tw-chip-turbo" title="Turbo Mode Active">' +
          '<svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"><path d="M9.5 1.5L3.5 9h4.2L6.5 14.5 12.5 7H8.3z" fill="currentColor"/></svg>' +
          '<span>Turbo</span></span>'
      );
    }
    if (state.fps60) {
      parts.push('<span class="tw-status-chip tw-chip-fps" title="60 FPS Mode Active">60 FPS</span>');
    }
    badgeWrapEl.innerHTML = parts.join('');
    badgeWrapEl.style.display = parts.length ? 'inline-flex' : 'none';
  }

  function mountStageControls() {
    var controls = document.querySelector('[class*="controls_controls-container"]');
    if (!controls) return;

    if (!controls.querySelector('.tw-pause-btn')) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tw-pause-btn';
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        setPaused(!state.paused);
      });

      // Insert right between Green Flag (first child) and Stop Sign (second child)
      var stopEl = controls.querySelector('[class*="stop-all_stop-all"]');
      if (stopEl && stopEl.parentNode === controls) {
        controls.insertBefore(btn, stopEl);
      } else {
        controls.appendChild(btn);
      }
      pauseBtnEl = btn;
      updatePauseButtonUI();
    }

    if (!controls.querySelector('.tw-runtime-badges')) {
      var badges = document.createElement('span');
      badges.className = 'tw-runtime-badges';
      controls.appendChild(badges);
      badgeWrapEl = badges;
      updateBadgesUI();
    }
  }

  // -------------------------------------------------------------------------
  // 2. TurboWarp Find (Ctrl+F) Bar beside Code / Costumes / Sounds tabs
  // -------------------------------------------------------------------------
  var findInputEl = null;
  var findResultsEl = null;
  var lastHighlightEl = null;

  function collectWorkspaceBlocks(query) {
    var q = String(query || '').trim().toLowerCase();
    if (!q) return [];
    var canvas = document.querySelector('.blocklySvg .blocklyBlockCanvas');
    if (!canvas) return [];
    var blocks = canvas.querySelectorAll('g.blocklyDraggable');
    var results = [];
    var seen = new Set();

    for (var i = 0; i < blocks.length; i++) {
      var block = blocks[i];
      var textNodes = block.querySelectorAll(':scope > text, :scope > g > text');
      var labelParts = [];
      for (var t = 0; t < textNodes.length; t++) {
        var txt = (textNodes[t].textContent || '').trim();
        if (txt) labelParts.push(txt);
      }
      var label = labelParts.join(' ').replace(/\s+/g, ' ').trim();
      if (!label) continue;
      if (label.toLowerCase().indexOf(q) === -1) continue;
      var id = block.getAttribute('data-id') || (label + '_' + i);
      if (seen.has(id)) continue;
      seen.add(id);

      var fill = '#4C97FF';
      var pathEl = block.querySelector(':scope > path.blocklyPath');
      if (pathEl) {
        var c = pathEl.getAttribute('fill');
        if (c && c !== 'none') fill = c;
      }

      results.push({ el: block, label: label, color: fill });
      if (results.length >= 24) break;
    }
    return results;
  }

  function highlightBlockElement(blockEl) {
    if (!blockEl) return;
    if (lastHighlightEl) {
      lastHighlightEl.classList.remove('tw-find-pulse');
    }
    lastHighlightEl = blockEl;
    blockEl.classList.add('tw-find-pulse');
    try {
      blockEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    } catch (_) {
      // Ignore
    }
    setTimeout(function () {
      if (blockEl) blockEl.classList.remove('tw-find-pulse');
    }, 1800);
  }

  function renderFindResults(query) {
    if (!findResultsEl) return;
    var trimmed = String(query || '').trim();
    if (!trimmed) {
      findResultsEl.style.display = 'none';
      findResultsEl.innerHTML = '';
      return;
    }
    var matches = collectWorkspaceBlocks(trimmed);
    findResultsEl.innerHTML = '';
    if (matches.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'tw-find-empty';
      empty.textContent = 'No matching blocks in current sprite';
      findResultsEl.appendChild(empty);
    } else {
      matches.forEach(function (item) {
        var row = document.createElement('button');
        row.type = 'button';
        row.className = 'tw-find-item';
        var dot = document.createElement('span');
        dot.className = 'tw-find-dot';
        dot.style.backgroundColor = item.color;
        var span = document.createElement('span');
        span.className = 'tw-find-label';
        span.textContent = item.label;
        row.appendChild(dot);
        row.appendChild(span);
        row.addEventListener('mousedown', function (e) {
          e.preventDefault();
          highlightBlockElement(item.el);
          findResultsEl.style.display = 'none';
        });
        findResultsEl.appendChild(row);
      });
    }
    findResultsEl.style.display = 'block';
  }

  function mountFindBar() {
    var tabList = document.querySelector('[class*="gui_tab-list"]');
    if (!tabList || tabList.querySelector('.tw-find-wrap')) return;

    var wrap = document.createElement('div');
    wrap.className = 'tw-find-wrap';

    var input = document.createElement('input');
    input.type = 'search';
    input.className = 'tw-find-input';
    input.placeholder = 'Find (Ctrl+F)';
    input.setAttribute('aria-label', 'Find blocks in workspace');

    var dropdown = document.createElement('div');
    dropdown.className = 'tw-find-dropdown';
    dropdown.style.display = 'none';

    input.addEventListener('input', function () {
      renderFindResults(input.value);
    });
    input.addEventListener('focus', function () {
      if (input.value.trim()) renderFindResults(input.value);
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        input.value = '';
        dropdown.style.display = 'none';
        input.blur();
      } else if (e.key === 'Enter') {
        var first = dropdown.querySelector('.tw-find-item');
        if (first) first.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      }
    });
    input.addEventListener('blur', function () {
      setTimeout(function () {
        dropdown.style.display = 'none';
      }, 160);
    });

    wrap.appendChild(input);
    wrap.appendChild(dropdown);
    tabList.appendChild(wrap);

    findInputEl = input;
    findResultsEl = dropdown;
  }

  // Global Ctrl+F / Cmd+F inside editor iframe focuses Find bar
  window.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
      if (findInputEl) {
        e.preventDefault();
        findInputEl.focus();
        findInputEl.select();
      }
    }
  });

  // Listen for same-origin TurboWarp runtime commands from CodingLabEditorHost
  window.addEventListener('message', function (event) {
    if (event.origin !== window.location.origin) return;
    if (event.source !== window.parent) return;
    var msg = event.data;
    if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return;

    if (msg.type === 'CODING_LAB_SET_TURBO_SETTINGS') {
      applyRuntimeSettings(msg.settings || {});
      return;
    }
    if (msg.type === 'CODING_LAB_TOGGLE_PAUSE') {
      setPaused(typeof msg.paused === 'boolean' ? msg.paused : !state.paused);
      return;
    }
    if (msg.type === 'CODING_LAB_FOCUS_FIND') {
      if (findInputEl) {
        findInputEl.focus();
        findInputEl.select();
      }
    }
  });

  // Mount UI controls cleanly as React renders & updates Scratch GUI
  function tickMount() {
    mountStageControls();
    mountFindBar();
    var vm = getVm();
    if (vm && patchedVm !== vm) {
      ensureVmHooks(vm);
      applyRuntimeSettings(state);
    }
  }

  var observer = new MutationObserver(function () {
    tickMount();
  });

  function start() {
    tickMount();
    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
