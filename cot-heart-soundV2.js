/* eslint-disable no-var */

(function () {
  ('use strict');

  var NAMESPACE = 'maya-cot-v3';
  var RECENT_ASSISTANT_LIMIT = 3;
  var POST_GENERATION_DELAY_MS = 420;
  var DOM_QUIET_MS = 520;
  var GENERATION_IDLE_FALLBACK_MS = 4200;
  var INIT_RENDER_DELAYS = [260, 900, 1800, 3600, 7000, 12000, 20000];
  var STARTUP_SCAN_INTERVAL_MS = 1000;
  var STARTUP_SCAN_WINDOW_MS = 30000;

  var APP_WINDOW = (function () {
    try {
      if (window.parent && window.parent !== window && window.parent.document) return window.parent;
    } catch (_) {
      /* cross-origin */
    }
    return window;
  })();
  var APP_DOCUMENT = APP_WINDOW.document || document;

// ---------- Công tắc tách biệt tiếng lòng (Lưu trữ bền vững vào biến kịch bản) ----------
var SEPARATE_HEART = (function () {
  try {
    if (typeof getVariables === 'function') {
      var v = getVariables({ type: 'script', script_id: getScriptId() });
      // Nếu người dùng chưa từng thiết lập, mặc định bật; nếu không thì đọc cài đặt của người dùng
      if (v && v.separateHeart !== undefined) {
        return !!v.separateHeart;
      }
      return true; // Mặc định bật
    }
  } catch (_) { /* noop */ }
  return true; // Mặc định bật
})();

  // ==========================================================================
  // Biểu thức chính quy (Regular Expressions)
  // ==========================================================================
  var COT_NAME_RE = /^(.*?)_(信息判定|行为逻辑|心里话)$/;
  var COT_OPEN_RE = /<([^<>\s/]+_(?:信息判定|行为逻辑|心里话))\s*>/g;
  var COT_TEXT_TAG_RE = /<\/?([^<>\s/]+_(?:信息判定|行为逻辑|心里话))\s*>/g;
  var FRONTEND_LABEL_RE = /^(显示|隐藏)前端代码块$/;
  var KIND_LABEL = {
    信息判定: 'Phán đoán thông tin',
    行为逻辑: 'Logic hành vi',
    心里话: 'Tiếng lòng',
  };

  // ==========================================================================
  // Trạng thái toàn cục
  // ==========================================================================
  var state = {
    disposed: false,
    generating: false,
    dirtyWhileGenerating: false,
    internalMutationDepth: 0,
    streamIdleTimer: 0,
    renderAllTimer: 0,
    mutationObserver: null,
    processed: new Map(),
    probes: new Map(),
    messageTimers: new Map(),
    touchedMessageIds: new Set(),
    stopList: [],
  };

  // ==========================================================================
  // Hàm tiện ích (Không thay đổi)
  // ==========================================================================

  function logWarn(message, error) {
    try {
      console.warn('[Tiểu COT V2] ' + message, error || '');
    } catch (_) {
      /* noop */
    }
  }

  function getCurrentScriptId() {
    try {
      if (typeof getScriptId === 'function') return getScriptId();
    } catch (_) {
      /* noop */
    }
    return 'v2';
  }

  function styleId() {
    return NAMESPACE + '-style-' + String(getCurrentScriptId()).replace(/[^\w-]/g, '_');
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char;
    });
  }

  function hashText(text) {
    var hash = 2166136261;
    text = String(text || '');
    for (var i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return String(hash >>> 0) + ':' + text.length;
  }

  function parseCotTagName(name) {
    var raw = String(name || '').trim();
    var match = raw.match(COT_NAME_RE);
    if (!match) return null;
    return { tag: raw, actor: match[1] || 'COT', kind: match[2] };
  }

  function isInsideOwnNode(node) {
    var element = node && (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement);
    return Boolean(
      element &&
      element.closest &&
      element.closest('.' + NAMESPACE + '-fold, .' + NAMESPACE + '-hidden, .' + NAMESPACE + '-original'),
    );
  }

  function isSkippableTextParent(node) {
    var parent = node && node.parentElement;
    if (!parent) return true;
    var tag = parent.tagName ? parent.tagName.toLowerCase() : '';
    return tag === 'script' || tag === 'style' || tag === 'textarea' || tag === 'input' || tag === 'select';
  }

  // ==========================================================================
  // Truy vấn DOM (Không thay đổi)
  // ==========================================================================

  function getMessageElement(messageId) {
    return APP_DOCUMENT.querySelector(
      '#chat > .mes[mesid="' + String(messageId) + '"][is_user="false"][is_system="false"]',
    );
  }

  function getTextContainer(messageId) {
    var message = getMessageElement(messageId);
    if (!message) return null;
    return message.querySelector('.mes_text');
  }

  function getDisplayedAssistantMessageIds() {
    return Array.from(APP_DOCUMENT.querySelectorAll('#chat > .mes[is_user="false"][is_system="false"]'))
      .map(function (node) {
        return Number(node.getAttribute('mesid'));
      })
      .filter(Number.isFinite);
  }

  function getCurrentMessageText(message) {
    if (!message) return '';
    var swipeId = Number.isFinite(message.swipe_id) ? message.swipe_id : 0;
    if (typeof message.message === 'string' && message.message) return message.message;
    if (Array.isArray(message.swipes)) return String(message.swipes[swipeId] || message.swipes[0] || '');
    if (typeof message.mes === 'string') return message.mes;
    return '';
  }

  function getMessageFromChat(messageId) {
    try {
      if (typeof getChatMessages === 'function') {
        var list = getChatMessages(messageId, { role: 'assistant', hide_state: 'all', include_swipes: true });
        if (list && list[0]) return list[0];
      }
    } catch (_) {
      /* fallback */
    }
    try {
      if (Array.isArray(window.chat) && window.chat[messageId]) return window.chat[messageId];
      if (APP_WINDOW !== window && Array.isArray(APP_WINDOW.chat) && APP_WINDOW.chat[messageId])
        return APP_WINDOW.chat[messageId];
    } catch (_) {
      /* noop */
    }
    return null;
  }

  function getMessageTextFromChat(messageId) {
    return getCurrentMessageText(getMessageFromChat(messageId));
  }

  function getRecentAssistantMessageIds(extraMessageId) {
    try {
      if (typeof getLastMessageId === 'function' && typeof getChatMessages === 'function') {
        var lastId = getLastMessageId();
        var list =
          getChatMessages('0-' + String(lastId), { role: 'assistant', hide_state: 'all', include_swipes: true }) || [];
        var ids = list
          .map(function (msg) {
            return Number(msg.message_id);
          })
          .filter(Number.isFinite);
        if (Number.isFinite(extraMessageId) && ids.indexOf(extraMessageId) === -1) ids.push(extraMessageId);
        return new Set(ids.slice(-RECENT_ASSISTANT_LIMIT));
      }
    } catch (_) {
      /* fallback */
    }
    var fallbackIds = getDisplayedAssistantMessageIds();
    if (Number.isFinite(extraMessageId) && fallbackIds.indexOf(extraMessageId) === -1) fallbackIds.push(extraMessageId);
    return new Set(fallbackIds.slice(-RECENT_ASSISTANT_LIMIT));
  }

  function isEditingMessage(messageId) {
    var textarea = APP_DOCUMENT.querySelector('#chat #curEditTextarea');
    if (!textarea) return false;
    var message = textarea.closest('.mes');
    return message && Number(message.getAttribute('mesid')) === Number(messageId);
  }

  // ==========================================================================
  // Dọn dẹp nhãn mã nguồn Front-end (Không thay đổi)
  // ==========================================================================

  function cleanupFrontendCodeLabels(root) {
    var chatRoot = APP_DOCUMENT.querySelector('#chat');
    if (!chatRoot) return;
    var scope = root && root.nodeType === Node.ELEMENT_NODE ? root : chatRoot;
    var walkerRoot =
      scope.matches && scope.matches('#chat .mes_text')
        ? scope
        : (scope.closest && scope.closest('#chat .mes_text')) || chatRoot;

    var walker = APP_DOCUMENT.createTreeWalker(walkerRoot, NodeFilter.SHOW_TEXT, null, false);
    while (walker.nextNode()) {
      var node = walker.currentNode;
      if (!node.parentElement || !node.parentElement.closest('#chat .mes_text')) continue;
      if (FRONTEND_LABEL_RE.test(String(node.nodeValue || '').trim())) node.nodeValue = '';
    }

    var elements = (walkerRoot.querySelectorAll ? walkerRoot : chatRoot).querySelectorAll(
      'button, a, summary, span, div, p',
    );
    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      if (!el.closest || !el.closest('#chat .mes_text')) continue;
      if (el.children.length > 0) continue;
      if (FRONTEND_LABEL_RE.test(String(el.textContent || '').trim())) {
        el.style.display = 'none';
        el.setAttribute('data-' + NAMESPACE + '-frontend-label-hidden', 'true');
      }
    }
  }

  // ==========================================================================
  // Biểu tượng SVG (Không thay đổi)
  // ==========================================================================

  function moonSvg() {
    return (
      '<svg class="' +
      NAMESPACE +
      '-moon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M20.2 15.8A8.3 8.3 0 0 1 8.2 3.8a.7.7 0 0 0-.7-1.1 9.8 9.8 0 1 0 13.8 13.8.7.7 0 0 0-1.1-.7Z"/></svg>'
    );
  }

  function chevronSvg() {
    return (
      '<svg class="' +
      NAMESPACE +
      '-chevron-svg" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" d="m9 18 6-6-6-6"/></svg>'
    );
  }

  // ==========================================================================
  // Range → HTML (Không thay đổi)
  // ==========================================================================

  function makeContentHtmlFromRange(range) {
    try {
      var fragment = range.cloneContents();
      var temp = APP_DOCUMENT.createElement('div');
      temp.appendChild(fragment);
      return temp.innerHTML.trim();
    } catch (_) {
      return '';
    }
  }

  function makeEmptySafeContent(contentHtml) {
    if (
      !contentHtml ||
      !String(contentHtml)
        .replace(/<[^>]*>/g, '')
        .trim()
    ) {
      return '<span class="' + NAMESPACE + '-empty">(Không có nội dung)</span>';
    }
    return contentHtml;
  }

  // ==========================================================================
  // Xây dựng giao diện gập mở (Không thay đổi)
  // ==========================================================================

  function createFoldElement(group, originalFragment, mode) {
    if (mode === 'hidden') {
      var hiddenHolder = APP_DOCUMENT.createElement('span');
      hiddenHolder.className = NAMESPACE + '-hidden';
      hiddenHolder.setAttribute('data-' + NAMESPACE, 'hidden');
      hiddenHolder.style.display = 'none';
      var hiddenOriginal = APP_DOCUMENT.createElement('span');
      hiddenOriginal.className = NAMESPACE + '-original';
      hiddenOriginal.setAttribute('aria-hidden', 'true');
      if (originalFragment) hiddenOriginal.appendChild(originalFragment.cloneNode(true));
      hiddenHolder.appendChild(hiddenOriginal);
      return hiddenHolder;
    }

    var holder = APP_DOCUMENT.createElement('details');
    holder.className = NAMESPACE + '-fold';
    holder.setAttribute('data-' + NAMESPACE, 'fold');

    // Mặc định mở rộng khi tiếng lòng tách biệt
    if (
      SEPARATE_HEART &&
      group.every(function (s) {
        return s.kind === '心里话';
      })
    ) {
      holder.open = true;
    }

    var original = APP_DOCUMENT.createElement('span');
    original.className = NAMESPACE + '-original';
    original.setAttribute('aria-hidden', 'true');
    if (originalFragment) original.appendChild(originalFragment.cloneNode(true));

    var actors = Array.from(
      new Set(
        group
          .map(function (s) {
            return s.actor;
          })
          .filter(Boolean),
      ),
    );
    var actorLabel = actors.join(' / ') || 'COT';

    var summary = APP_DOCUMENT.createElement('summary');
    summary.className = NAMESPACE + '-summary';
    summary.innerHTML =
      '<span class="' +
      NAMESPACE +
      '-icon">' +
      moonSvg() +
      '</span>' +
      '<span class="' +
      NAMESPACE +
      '-title">Tiểu COT</span>' +
      '<span class="' +
      NAMESPACE +
      '-meta">' +
      escapeHtml(actorLabel) +
      ' · ' +
      group.length +
      ' đoạn · Đã thu gọn</span>' +
      '<span class="' +
      NAMESPACE +
      '-chevron">' +
      chevronSvg() +
      '</span>';

    var body = APP_DOCUMENT.createElement('div');
    body.className = NAMESPACE + '-body';

    for (var i = 0; i < group.length; i++) {
      var section = group[i];
      var item = APP_DOCUMENT.createElement('section');
      item.className = NAMESPACE + '-section';
      item.innerHTML =
        '<div class="' +
        NAMESPACE +
        '-section-head">' +
        '<span class="' +
        NAMESPACE +
        '-kind">' +
        escapeHtml(KIND_LABEL[section.kind] || section.kind) +
        '</span>' +
        '<span class="' +
        NAMESPACE +
        '-tag">' +
        escapeHtml('<' + section.tag + '>') +
        '</span>' +
        '</div>' +
        '<div class="' +
        NAMESPACE +
        '-content">' +
        makeEmptySafeContent(section.contentHtml) +
        '</div>';
      body.appendChild(item);
    }

    holder.appendChild(summary);
    holder.appendChild(body);
    holder.appendChild(original);
    return holder;
  }

  // ==========================================================================
  // Thao tác Range (Không thay đổi)
  // ==========================================================================

  function replaceRangeWithFold(range, group, mode) {
    var fragment = range.extractContents();
    var fold = createFoldElement(group, fragment, mode);
    range.insertNode(fold);
    return fold;
  }

  function unwrapCot(container) {
    var nodes = Array.from(container.querySelectorAll('.' + NAMESPACE + '-fold, .' + NAMESPACE + '-hidden'));
    for (var i = nodes.length - 1; i >= 0; i--) {
      var node = nodes[i];
      var original = node.querySelector(':scope > .' + NAMESPACE + '-original');
      var fragment = APP_DOCUMENT.createDocumentFragment();
      if (original && original.childNodes.length > 0) {
        for (var j = 0; j < original.childNodes.length; j++) {
          fragment.appendChild(original.childNodes[j].cloneNode(true));
        }
      }
      node.replaceWith(fragment);
    }
  }

  // ==========================================================================
  // Cấp độ 1: Chế độ phần tử (Sửa đổi groupSections để hỗ trợ tách biệt)
  // ==========================================================================

  function getCotElementInfo(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE || isInsideOwnNode(element)) return null;
    var local = element.localName || element.tagName || '';
    var parsed = parseCotTagName(local);
    if (!parsed) return null;
    return {
      element: element,
      tag: parsed.tag,
      actor: parsed.actor,
      kind: parsed.kind,
      contentHtml: element.innerHTML.trim(),
    };
  }

  function collectCotElements(container) {
    return Array.from(container.querySelectorAll('*'))
      .map(getCotElementInfo)
      .filter(Boolean)
      .filter(function (info) {
        return (
          !info.element.querySelector('*') ||
          !Array.from(info.element.querySelectorAll('*')).some(function (child) {
            return Boolean(getCotElementInfo(child));
          })
        );
      });
  }

  // ---------- Sửa đổi groupSections ----------
  function groupSections(sections) {
    if (sections.length === 0) return [];
    var groups = [];
    var current = [];
    for (var i = 0; i < sections.length; i++) {
      var section = sections[i];
      if (section.kind === '心里话' && current.length > 0) {
        groups.push(current);
        current = [];
      }
      if (SEPARATE_HEART && current.length > 0) {
        var hasHeart = current.some(function (s) {
          return s.kind === '心里话';
        });
        var isHeart = section.kind === '心里话';
        if ((hasHeart && !isHeart) || (!hasHeart && isHeart)) {
          groups.push(current);
          current = [];
        }
      }
      current.push(section);
    }
    if (current.length > 0) groups.push(current);
    return groups;
  }

  function wrapCotElements(container, mode) {
    var sections = collectCotElements(container);
    if (sections.length === 0) return 0;
    var groups = groupSections(sections);
    var count = 0;

    state.internalMutationDepth += 1;
    try {
      for (var g = groups.length - 1; g >= 0; g--) {
        var group = groups[g];
        var first = group[0].element;
        var last = group[group.length - 1].element;
        if (!first.isConnected || !last.isConnected || !container.contains(first) || !container.contains(last))
          continue;

        var range = APP_DOCUMENT.createRange();
        range.setStartBefore(first);

        var endNode = last;
        var nextSibling = last.nextSibling;
        while (nextSibling) {
          if (nextSibling.nodeType === Node.TEXT_NODE) {
            var nextText = nextSibling.nodeValue || '';
            var trimmed = nextText.replace(/[\s ]+/g, '');
            if (
              trimmed.length > 0 &&
              /^[。，！？、；：…·.,!?;:'"()\[\]{}【】《》〈〉「」『』""''—\-―～／￥…·　\s ]+$/.test(trimmed)
            ) {
              endNode = nextSibling;
              nextSibling = nextSibling.nextSibling;
              continue;
            }
          }
          break;
        }
        range.setEndAfter(endNode);

        replaceRangeWithFold(range, group, mode);
        count += 1;
      }
    } finally {
      state.internalMutationDepth -= 1;
    }
    return count;
  }

  // ==========================================================================
  // Cấp độ 2: Chế độ văn bản nguồn (Sửa đổi groupCotRanges để hỗ trợ tách biệt)
  // ==========================================================================

  function collectTextNodes(container) {
    var walker = APP_DOCUMENT.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
    var nodes = [];
    while (walker.nextNode()) {
      var parent = walker.currentNode.parentElement;
      if (parent && parent.closest('.' + NAMESPACE + '-fold, .' + NAMESPACE + '-hidden')) continue;
      if (isSkippableTextParent(walker.currentNode)) continue;
      nodes.push(walker.currentNode);
    }
    return nodes;
  }

  function parseCotRegionsFromSource(messageText) {
    var regions = [];
    var re = /<([^<>\s/]+_(?:信息判定|行为逻辑|心里话))\s*>/g;
    var match;

    while ((match = re.exec(messageText)) !== null) {
      var tag = match[1];
      var parsed = parseCotTagName(tag);
      if (!parsed) continue;

      var openStart = match.index;
      var openEnd = match.index + match[0].length;

      var closeTag = '</' + tag + '>';
      var closeStart = messageText.indexOf(closeTag, openEnd);
      if (closeStart === -1) continue;

      var closeEnd = closeStart + closeTag.length;
      var content = messageText.slice(openEnd, closeStart);

      regions.push({
        tag: tag,
        actor: parsed.actor,
        kind: parsed.kind,
        content: content,
        openStart: openStart,
        openEnd: openEnd,
        closeStart: closeStart,
        closeEnd: closeEnd,
      });

      re.lastIndex = closeEnd;
    }

    for (var i = 0; i < regions.length - 1; i++) {
      var between = messageText.slice(regions[i].closeEnd, regions[i + 1].openStart);
      var nonBlank = between.replace(/[\s ]+/g, '');
      if (nonBlank.length > 0) {
        regions[i].bodyTextAfter = true;
      }
    }
    if (regions.length > 0) {
      regions[regions.length - 1].bodyTextAfter = true;
    }

    return regions;
  }

  function findCotRanges(container, messageText) {
    var sourceRegions = parseCotRegionsFromSource(messageText);
    if (sourceRegions.length === 0) return [];

    var textNodes = collectTextNodes(container);
    if (textNodes.length === 0) return [];

    var domOpenTags = [];
    for (var i = 0; i < textNodes.length; i++) {
      var text = textNodes[i].textContent;
      COT_OPEN_RE.lastIndex = 0;
      var m;
      while ((m = COT_OPEN_RE.exec(text)) !== null) {
        var tag = m[1];
        var parsed = parseCotTagName(tag);
        if (!parsed) continue;
        domOpenTags.push({
          tag: tag,
          actor: parsed.actor,
          kind: parsed.kind,
          nodeIndex: i,
          node: textNodes[i],
          openStartOffset: m.index,
          openEndOffset: m.index + m[0].length,
        });
      }
    }
    if (domOpenTags.length === 0) return [];

    var matchCount = Math.min(domOpenTags.length, sourceRegions.length);
    var ranges = [];

    function makeDomWalker(startNodeIndex, startOffset) {
      var ni = startNodeIndex;
      var off = startOffset;
      return {
        char: function () {
          if (ni >= textNodes.length) return null;
          if (off >= textNodes[ni].textContent.length) {
            ni++;
            off = 0;
            return this.char();
          }
          return textNodes[ni].textContent[off];
        },
        advance: function () {
          if (ni < textNodes.length) {
            off++;
            if (off >= textNodes[ni].textContent.length) {
              ni++;
              off = 0;
            }
          }
        },
        isEnd: function () {
          return ni >= textNodes.length;
        },
        getNode: function () {
          return ni < textNodes.length ? textNodes[ni] : null;
        },
        getOffset: function () {
          return off;
        },
      };
    }

    function isSameChar(a, b) {
      if (a === b) return true;
      if (
        (a === ' ' || a === '\t' || a === '\n' || a === '\r' || a === '\u00A0') &&
        (b === ' ' || b === '\t' || b === '\n' || b === '\r' || b === '\u00A0')
      ) {
        return true;
      }
      return false;
    }

    for (var idx = 0; idx < matchCount; idx++) {
      var domTag = domOpenTags[idx];
      var srcRegion = sourceRegions[idx];
      if (domTag.tag !== srcRegion.tag) continue;

      var closeEndNode = null;
      var closeEndOffset = -1;

      var nextIsCot = idx + 1 < domOpenTags.length;
      var hasBodyAfter = srcRegion.bodyTextAfter;

      if (nextIsCot && !hasBodyAfter) {
        var nextTag = domOpenTags[idx + 1];
        closeEndNode = nextTag.node;
        closeEndOffset = nextTag.openStartOffset;
      } else {
        var walker = makeDomWalker(domTag.nodeIndex, domTag.openEndOffset);
        var srcPos = srcRegion.openEnd;
        var srcEnd = srcRegion.closeStart;

        while (
          srcPos < srcEnd &&
          isSameChar(messageText[srcPos], walker.char()) &&
          /[\s\u00A0]/.test(messageText[srcPos])
        ) {
          walker.advance();
          srcPos++;
        }

        while (srcPos < srcEnd && !walker.isEnd()) {
          var srcChar = messageText[srcPos];
          var domChar = walker.char();
          if (domChar === null) break;

          if (isSameChar(srcChar, domChar)) {
            walker.advance();
            srcPos++;
          } else {
            walker.advance();
          }
        }

        if (srcPos >= srcEnd) {
          closeEndNode = walker.getNode();
          closeEndOffset = walker.getOffset();
        } else if (nextIsCot) {
          closeEndNode = domOpenTags[idx + 1].node;
          closeEndOffset = domOpenTags[idx + 1].openStartOffset;
        } else {
          // Bắt đáy: Tìm kiếm ngược </ để xác định vị trí thẻ đóng, tránh việc làm hỏng nội dung chính
          var fallbackFound = false;
          for (var k = textNodes.length - 1; k >= domTag.nodeIndex; k--) {
            var t = textNodes[k].textContent;
            var closeIdx = t.lastIndexOf('</');
            if (closeIdx !== -1) {
              closeEndNode = textNodes[k];
              closeEndOffset = closeIdx;
              fallbackFound = true;
              break;
            }
          }
          if (!fallbackFound) {
            continue;
          }
        }
      }

      if (!closeEndNode) {
        if (nextIsCot) {
          closeEndNode = domOpenTags[idx + 1].node;
          closeEndOffset = domOpenTags[idx + 1].openStartOffset;
        } else {
          var lastNode2 = textNodes[textNodes.length - 1];
          closeEndNode = lastNode2;
          closeEndOffset = lastNode2.textContent.length;
        }
      }

      ranges.push({
        actor: domTag.actor,
        kind: domTag.kind,
        tag: domTag.tag,
        openStartNode: domTag.node,
        openStartOffset: domTag.openStartOffset,
        contentStartNode: domTag.node,
        contentStartOffset: domTag.openEndOffset,
        closeStartNode: closeEndNode,
        closeStartOffset: closeEndOffset,
        closeEndNode: closeEndNode,
        closeEndOffset: closeEndOffset,
      });
    }
    return ranges;
  }

  // ---------- Sửa đổi groupCotRanges ----------
  function groupCotRanges(ranges) {
    if (ranges.length === 0) return [];
    var groups = [];
    var currentGroup = [ranges[0]];
    for (var i = 1; i < ranges.length; i++) {
      var prev = ranges[i - 1];
      var next = ranges[i];
      var split = false;
      if (next.kind === '信息判定') {
        split = true;
      } else if (prev.actor !== next.actor) {
        split = true;
      } else if (
        currentGroup.some(function (r) {
          return r.kind === next.kind;
        })
      ) {
        split = true;
      }
      if (!split && SEPARATE_HEART) {
        var hasHeart = currentGroup.some(function (r) {
          return r.kind === '心里话';
        });
        var isHeart = next.kind === '心里话';
        if ((hasHeart && !isHeart) || (!hasHeart && isHeart)) {
          split = true;
        }
      }
      if (split) {
        groups.push(currentGroup);
        currentGroup = [next];
      } else {
        currentGroup.push(next);
      }
    }
    groups.push(currentGroup);
    return groups;
  }

  function buildSectionFromRange(range) {
    var contentRange = APP_DOCUMENT.createRange();
    contentRange.setStart(range.contentStartNode, range.contentStartOffset);
    contentRange.setEnd(range.closeStartNode, range.closeStartOffset);
    return {
      tag: range.tag,
      actor: range.actor,
      kind: range.kind,
      contentHtml: makeContentHtmlFromRange(contentRange),
    };
  }

  function wrapmessageTextCot(container, messageText, mode) {
    if (!messageText) return 0;

    var ranges = findCotRanges(container, messageText);
    if (ranges.length === 0) return 0;

    var groups = groupCotRanges(ranges);
    var count = 0;

    state.internalMutationDepth += 1;
    try {
      for (var g = groups.length - 1; g >= 0; g--) {
        var group = groups[g];
        var first = group[0];
        var last = group[group.length - 1];

        var range = APP_DOCUMENT.createRange();
        range.setStart(first.openStartNode, first.openStartOffset);
        range.setEnd(last.closeEndNode, last.closeEndOffset);

        var sections = group.map(buildSectionFromRange);
        replaceRangeWithFold(range, sections, mode);
        count += 1;
      }
    } finally {
      state.internalMutationDepth -= 1;
    }
    return count;
  }

  // ==========================================================================
  // Cấp độ 3: Bắt đáy khối lỏng lẻo (Không thay đổi)
  // ==========================================================================

  function getLooseCotBlockInfo(block) {
    if (!block || block.nodeType !== Node.ELEMENT_NODE || isInsideOwnNode(block)) return null;
    if (!block.closest || !block.closest('#chat .mes_text')) return null;
    if (block.querySelector('.' + NAMESPACE + '-fold, .' + NAMESPACE + '-hidden')) return null;

    var text = String(block.textContent || '');
    var match = text.match(/^\s*<([^<>\s/]+_(?:信息判定|行为逻辑|心里话))\s*>/);
    if (!match) return null;
    var parsed = parseCotTagName(match[1]);
    if (!parsed) return null;
    if (text.indexOf('</' + parsed.tag + '>') !== -1) return null;

    var clone = block.cloneNode(true);
    var walker = APP_DOCUMENT.createTreeWalker(clone, NodeFilter.SHOW_TEXT, null, false);
    while (walker.nextNode()) {
      var node = walker.currentNode;
      var value = node.nodeValue || '';
      var loose = value.match(/^\s*<([^<>\s/]+_(?:信息判定|行为逻辑|心里话))\s*>\s*/);
      if (loose && loose[1] === parsed.tag) {
        node.nodeValue = value.slice(loose[0].length);
        break;
      }
    }

    return {
      element: block,
      tag: parsed.tag,
      actor: parsed.actor,
      kind: parsed.kind,
      contentHtml: clone.innerHTML.trim(),
    };
  }

  function collectLooseCotBlocks(container) {
    return Array.from(container.querySelectorAll('p, li, blockquote, pre')).map(getLooseCotBlockInfo).filter(Boolean);
  }

  function wrapLooseCotBlocks(container, mode) {
    var sections = collectLooseCotBlocks(container);
    if (sections.length === 0) return 0;

    var groups = [];
    var current = [];
    var previousElement = null;

    for (var i = 0; i < sections.length; i++) {
      var section = sections[i];
      var adjacent = previousElement && previousElement.nextElementSibling === section.element;
      var split = false;
      if (!adjacent) {
        split = true;
      } else if (section.kind === '信息判定' && current.length > 0) {
        split = true;
      } else if (SEPARATE_HEART && current.length > 0) {
        var hasHeart = current.some(function (s) {
          return s.kind === '心里话';
        });
        var isHeart = section.kind === '心里话';
        if ((hasHeart && !isHeart) || (!hasHeart && isHeart)) {
          split = true;
        }
      }
      if (split) {
        if (current.length > 0) groups.push(current);
        current = [];
      }
      current.push(section);
      previousElement = section.element;
    }
    if (current.length > 0) groups.push(current);

    var count = 0;
    state.internalMutationDepth += 1;
    try {
      for (var g = groups.length - 1; g >= 0; g--) {
        var group = groups[g];
        var first = group[0].element;
        var last = group[group.length - 1].element;
        if (!first.isConnected || !last.isConnected || !container.contains(first) || !container.contains(last))
          continue;

        var range = APP_DOCUMENT.createRange();
        range.setStartBefore(first);
        var endNode = last;
        var nextSibling = last.nextSibling;
        while (nextSibling) {
          if (nextSibling.nodeType === Node.TEXT_NODE) {
            var nextText = nextSibling.nodeValue || '';
            var trimmed = nextText.replace(/[\s ]+/g, '');
            if (
              trimmed.length > 0 &&
              /^[。，！？、；：…·.,!?;:'"()\[\]{}【】《》〈〉「」『』""''—\-―～／￥\s ]+$/.test(trimmed)
            ) {
              endNode = nextSibling;
              nextSibling = nextSibling.nextSibling;
              continue;
            }
          }
          break;
        }
        range.setEndAfter(endNode);

        replaceRangeWithFold(range, group, mode);
        count += 1;
      }
    } finally {
      state.internalMutationDepth -= 1;
    }
    return count;
  }

  // ==========================================================================
  // Logic kết xuất (Render) cốt lõi (Không thay đổi)
  // ==========================================================================

  function containerHasUnwrappedCot(container) {
    if (!container) return false;
    if (collectCotElements(container).length > 0) return true;
    var text = collectTextNodes(container)
      .map(function (n) {
        return n.nodeValue || '';
      })
      .join('');
    COT_TEXT_TAG_RE.lastIndex = 0;
    return COT_TEXT_TAG_RE.test(text);
  }

  function sourceHasCot(text) {
    COT_TEXT_TAG_RE.lastIndex = 0;
    return COT_TEXT_TAG_RE.test(String(text || ''));
  }

  function modeForMessage(messageId) {
    return getRecentAssistantMessageIds(messageId).has(Number(messageId)) ? 'fold' : 'hidden';
  }

  function renderMessageNow(messageId, reason) {
    if (state.disposed) return false;
    if (!Number.isFinite(Number(messageId))) return false;
    if (isEditingMessage(Number(messageId))) return false;
    if (
      state.generating &&
      reason !== 'generation-complete' &&
      reason !== 'manual-complete' &&
      reason !== 'heart-toggle'
    ) {
      state.dirtyWhileGenerating = true;
      return false;
    }

    var container = getTextContainer(messageId);
    if (!container) return false;

    var messageText = getMessageTextFromChat(messageId);
    var mode = modeForMessage(messageId);
    var signature = mode + ':heart-' + (SEPARATE_HEART ? 'separate' : 'merged') + ':' + hashText(messageText);
    var messageElement = getMessageElement(messageId);

    cleanupFrontendCodeLabels(container);

    if (state.processed.get(Number(messageId)) === signature && !containerHasUnwrappedCot(container)) {
      if (messageElement) messageElement.setAttribute('data-' + NAMESPACE, mode);
      return true;
    }

    var hasCot = sourceHasCot(messageText) || containerHasUnwrappedCot(container);

    state.internalMutationDepth += 1;
    try {
      unwrapCot(container);

      if (hasCot) {
        wrapCotElements(container, mode);
        wrapmessageTextCot(container, messageText, mode);
        if (containerHasUnwrappedCot(container)) {
          wrapLooseCotBlocks(container, mode);
        }
      }
    } catch (error) {
      logWarn('Xử lý tin nhắn thất bại mesid=' + messageId, error);
      return false;
    } finally {
      state.internalMutationDepth -= 1;
    }

    if (messageElement) messageElement.setAttribute('data-' + NAMESPACE, hasCot ? mode : 'none');
    state.processed.set(Number(messageId), signature);
    state.touchedMessageIds.add(Number(messageId));
    return true;
  }

  // ==========================================================================
  // Điều độ và Thăm dò sự ổn định của DOM (Thêm mới renderAllNow)
  // ==========================================================================

  function sampleMessageState(messageId) {
    var container = getTextContainer(messageId);
    if (!container) return '';
    var messageText = getMessageTextFromChat(messageId);
    return (
      hashText(messageText) + '|' + hashText(container.textContent || '') + '|' + container.querySelectorAll('*').length
    );
  }

  function clearMessageTimer(messageId) {
    var key = Number(messageId);
    var timer = state.messageTimers.get(key);
    if (timer) window.clearTimeout(timer);
    state.messageTimers.delete(key);
  }

  function scheduleMessageRender(messageId, delay, reason) {
    var id = Number(messageId);
    if (!Number.isFinite(id)) return;
    if (state.disposed) return;
    if (
      state.generating &&
      reason !== 'generation-complete' &&
      reason !== 'manual-complete' &&
      reason !== 'heart-toggle'
    ) {
      state.dirtyWhileGenerating = true;
      return;
    }
    clearMessageTimer(id);
    var timer = window.setTimeout(
      function () {
        waitUntilStableAndRender(id, reason || 'scheduled', 0);
      },
      Math.max(0, delay || 0),
    );
    state.messageTimers.set(id, timer);
  }

  function waitUntilStableAndRender(messageId, reason, attempt) {
    clearMessageTimer(messageId);
    if (state.disposed) return;
    if (
      state.generating &&
      reason !== 'generation-complete' &&
      reason !== 'manual-complete' &&
      reason !== 'heart-toggle'
    ) {
      state.dirtyWhileGenerating = true;
      return;
    }

    var sample = sampleMessageState(messageId);
    var previous = state.probes.get(messageId);
    if (!previous || previous.sample !== sample) {
      state.probes.set(messageId, { sample: sample, attempt: attempt });
      var timer = window.setTimeout(function () {
        waitUntilStableAndRender(messageId, reason, attempt + 1);
      }, DOM_QUIET_MS);
      state.messageTimers.set(messageId, timer);
      return;
    }

    state.probes.delete(messageId);
    renderMessageNow(messageId, reason);
  }

  function scheduleDisplayedMessages(delay, reason) {
    if (state.disposed) return;
    if (
      state.generating &&
      reason !== 'generation-complete' &&
      reason !== 'manual-complete' &&
      reason !== 'heart-toggle'
    ) {
      state.dirtyWhileGenerating = true;
      return;
    }
    window.clearTimeout(state.renderAllTimer);
    state.renderAllTimer = window.setTimeout(
      function () {
        var ids = getDisplayedAssistantMessageIds();
        for (var i = 0; i < ids.length; i++) {
          scheduleMessageRender(ids[i], 0, reason || 'all');
        }
      },
      Math.max(0, delay || 0),
    );
  }

  // ---------- Thêm mới: Kết xuất (Render) toàn bộ các tin nhắn đang hiển thị ngay lập tức ----------
  function renderAllNow(reason) {
    if (state.disposed) return;
    var ids = getDisplayedAssistantMessageIds();
    for (var i = 0; i < ids.length; i++) {
      clearMessageTimer(ids[i]);
      renderMessageNow(ids[i], reason || 'manual-complete');
    }
  }

  // ==========================================================================
  // Quản lý trạng thái tạo ra (Generation) (Không thay đổi)
  // ==========================================================================

  function beginGeneration() {
    if (state.disposed) return;
    state.generating = true;
    state.dirtyWhileGenerating = true;
    scheduleGenerationIdleFallback('send-idle-fallback');
  }

  function scheduleGenerationIdleFallback(reason) {
    if (state.disposed) return;
    window.clearTimeout(state.streamIdleTimer);
    state.streamIdleTimer = window.setTimeout(function () {
      if (!state.generating) return;
      finishGeneration(reason || 'generation-idle-fallback');
    }, GENERATION_IDLE_FALLBACK_MS);
  }

  function noteGenerationActivity(reason) {
    if (state.disposed) return;
    if (!state.generating) return;
    state.dirtyWhileGenerating = true;
    scheduleGenerationIdleFallback(reason || 'activity-idle-fallback');
  }

  function noteStreamToken() {
    noteGenerationActivity('stream-idle-fallback');
  }

  function finishGeneration(reason) {
    if (state.disposed) return;
    window.clearTimeout(state.streamIdleTimer);
    state.generating = false;
    state.dirtyWhileGenerating = false;
    scheduleDisplayedMessages(
      POST_GENERATION_DELAY_MS,
      /idle-fallback/.test(String(reason || '')) ? 'manual-complete' : 'generation-complete',
    );
  }

  // ==========================================================================
  // MutationObserver (Không thay đổi)
  // ==========================================================================

  function maybeScheduleFromDomMutation(target) {
    if (state.internalMutationDepth > 0 || state.disposed) return;
    cleanupFrontendCodeLabels(target && target.nodeType === Node.ELEMENT_NODE ? target : APP_DOCUMENT);
    if (state.generating) {
      noteGenerationActivity('dom-idle-fallback');
      return;
    }
    scheduleDisplayedMessages(700, 'dom-stable');
  }

  function startDomObserver() {
    var Observer = APP_WINDOW.MutationObserver || window.MutationObserver;
    if (!Observer) return;
    var observerRoot = APP_DOCUMENT.body || APP_DOCUMENT.documentElement;
    if (!observerRoot) {
      var timer = window.setTimeout(startDomObserver, 600);
      state.stopList.push(function () {
        window.clearTimeout(timer);
      });
      return;
    }

    state.mutationObserver = new Observer(function (mutations) {
      if (state.internalMutationDepth > 0 || state.disposed) return;
      var relevant = false;
      var target = null;
      for (var i = 0; i < mutations.length; i++) {
        var mutation = mutations[i];
        target = mutation.target;
        if (mutation.type === 'characterData') {
          var value = String(mutation.target.nodeValue || '');
          if (
            value.indexOf('_信息判定') !== -1 ||
            value.indexOf('_行为逻辑') !== -1 ||
            value.indexOf('_心里话') !== -1 ||
            FRONTEND_LABEL_RE.test(value.trim())
          ) {
            relevant = true;
            break;
          }
        }
        for (var j = 0; j < (mutation.addedNodes || []).length; j++) {
          var node = mutation.addedNodes[j];
          var text = String(node.textContent || '');
          if (
            text.indexOf('_信息判定') !== -1 ||
            text.indexOf('_行为逻辑') !== -1 ||
            text.indexOf('_心里话') !== -1 ||
            FRONTEND_LABEL_RE.test(text.trim())
          ) {
            relevant = true;
            target = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
            break;
          }
          if (node.nodeType === Node.ELEMENT_NODE && collectCotElements(node).length > 0) {
            relevant = true;
            target = node;
            break;
          }
        }
        if (relevant) break;
      }
      if (relevant) maybeScheduleFromDomMutation(target);
    });

    state.mutationObserver.observe(observerRoot, { childList: true, subtree: true, characterData: true });
    state.stopList.push(function () {
      if (state.mutationObserver) state.mutationObserver.disconnect();
      state.mutationObserver = null;
    });
  }

  // ==========================================================================
  // Bắt đầu vòng lặp quét khởi động (Không thay đổi)
  // ==========================================================================

  function startStartupScanLoop() {
    var startedAt = Date.now();
    var tick = function () {
      if (state.disposed) return;
      scheduleDisplayedMessages(0, 'startup-scan');
      if (Date.now() - startedAt >= STARTUP_SCAN_WINDOW_MS) window.clearInterval(timer);
    };
    var timer = window.setInterval(tick, STARTUP_SCAN_INTERVAL_MS);
    state.stopList.push(function () {
      window.clearInterval(timer);
    });
    tick();
  }

  // ==========================================================================
  // Gỡ lỗi API (Sử dụng renderAllNow)
  // ==========================================================================

  function exposeDebugApi() {
    try {
      APP_WINDOW.__mayaCotV2Debug = {
        version: 'v3-reasoning-tide-merged',
        state: state,
        scan: function () {
          scheduleDisplayedMessages(0, 'manual-complete');
        },
        finish: function () {
          finishGeneration('manual-debug');
        },
        ids: getDisplayedAssistantMessageIds,
        setHeartSeparate: function (enable) {
          SEPARATE_HEART = !!enable;
          try {
            if (typeof replaceVariables === 'function') {
              replaceVariables({ separateHeart: SEPARATE_HEART }, { type: 'script', script_id: getScriptId() });
            }
          } catch (_) { /* noop */ }
          renderAllNow('heart-toggle');
          try {
            toastr?.success?.('Tách biệt tiếng lòng ' + (SEPARATE_HEART ? 'đã bật' : 'đã tắt'));
          } catch (_) {}
        },
        getHeartSeparate: function () {
          return SEPARATE_HEART;
        },
      };
    } catch (_) {
      /* noop */
    }
  }

  // ==========================================================================
  // Liên kết sự kiện (Lắng nghe nút bấm sử dụng renderAllNow)
  // ==========================================================================

  function getEventMap() {
    try {
      if (typeof tavern_events !== 'undefined' && tavern_events) return tavern_events;
    } catch (_) {
      /* noop */
    }
    try {
      var source = window.SillyTavern || APP_WINDOW.SillyTavern;
      var context = source && source.getContext && source.getContext();
      if (context && context.event_types) return context.event_types;
    } catch (_) {
      /* noop */
    }
    return {};
  }

  function listenEvent(eventName, listener, last) {
    if (typeof eventName !== 'string' || !eventName) return;
    var eventMap = getEventMap();
    var event = eventMap[eventName] || eventName;
    if (!event) return;
    var wrapped = typeof errorCatched === 'function' ? errorCatched(listener) : listener;
    try {
      if (typeof eventOn === 'function') {
        var ret = last && typeof eventMakeLast === 'function' ? eventMakeLast(event, wrapped) : eventOn(event, wrapped);
        if (ret && typeof ret.stop === 'function') state.stopList.push(ret.stop);
        return;
      }
    } catch (error) {
      logWarn('Liên kết eventOn thất bại ' + eventName, error);
    }
    try {
      var source = window.SillyTavern || APP_WINDOW.SillyTavern;
      var context = source && source.getContext && source.getContext();
      if (context && context.eventSource && typeof context.eventSource.on === 'function') {
        context.eventSource.on(event, wrapped);
        if (typeof context.eventSource.off === 'function') {
          state.stopList.push(function () {
            context.eventSource.off(event, wrapped);
          });
        }
      }
    } catch (error) {
      logWarn('Liên kết eventSource thất bại ' + eventName, error);
    }
  }

  // ---------- Liên kết nút bấm "Tiếng lòng" (Kết xuất ngay lập tức) ----------
  function bindToggleHeartButton() {
    var buttonName = 'Tiếng lòng';
    var eventName = null;
    try {
      if (typeof getButtonEvent === 'function') {
        eventName = getButtonEvent(buttonName);
      }
    } catch (_) {}
    if (!eventName) {
      logWarn('Không thể lấy sự kiện nút bấm \"' + buttonName + '\", vui lòng đảm bảo trợ lý nhập liệu đã được tải và nút bấm tồn tại.');
      return;
    }

    listenEvent(
      eventName,
      function () {    SEPARATE_HEART = !SEPARATE_HEART;
        try {
          if (typeof replaceVariables === 'function') {
            replaceVariables({ separateHeart: SEPARATE_HEART }, { type: 'script', script_id: getScriptId() });
          }
        } catch (_) { /* noop */ }
        renderAllNow('heart-toggle');
        try {
          if (typeof toastr !== 'undefined' && toastr.success) {
            toastr.success('Tách biệt tiếng lòng ' + (SEPARATE_HEART ? 'đã bật' : 'đã tắt'));
          } else {
            console.log('[Tiểu COT] Tách biệt tiếng lòng ' + (SEPARATE_HEART ? 'đã bật' : 'đã tắt'));
          }
        } catch (_) {}
      },
      false,
    );
  }

  function bindEvents() {
    listenEvent(
      'CHAT_CHANGED',
      function () {
        state.processed.clear();
        state.probes.clear();
        scheduleDisplayedMessages(260, 'chat-changed');
      },
      true,
    );
    listenEvent(
      'CHAT_LOADED',
      function () {
        scheduleDisplayedMessages(260, 'chat-loaded');
      },
      true,
    );
    listenEvent(
      'chatLoaded',
      function () {
        scheduleDisplayedMessages(260, 'chat-loaded');
      },
      true,
    );
    listenEvent(
      'MORE_MESSAGES_LOADED',
      function () {
        scheduleDisplayedMessages(320, 'more-loaded');
      },
      true,
    );
    listenEvent(
      'MESSAGE_SWIPED',
      function () {
        state.processed.clear();
        state.probes.clear();
        scheduleDisplayedMessages(320, 'swiped');
      },
      true,
    );
    listenEvent(
      'MESSAGE_EDITED',
      function () {
        state.processed.clear();
        state.probes.clear();
        scheduleDisplayedMessages(260, 'edited');
      },
      true,
    );
    listenEvent(
      'MESSAGE_DELETED',
      function () {
        state.processed.clear();
        state.probes.clear();
        scheduleDisplayedMessages(260, 'deleted');
      },
      true,
    );
    listenEvent(
      'MESSAGE_UPDATED',
      function () {
        if (!state.generating) scheduleDisplayedMessages(650, 'updated');
        else noteGenerationActivity('message-updated-idle-fallback');
      },
      false,
    );
    listenEvent(
      'MESSAGE_RECEIVED',
      function () {
        if (!state.generating) scheduleDisplayedMessages(650, 'received');
        else noteGenerationActivity('message-received-idle-fallback');
      },
      false,
    );
    listenEvent(
      'CHARACTER_MESSAGE_RENDERED',
      function () {
        if (!state.generating) scheduleDisplayedMessages(650, 'rendered');
        else noteGenerationActivity('message-rendered-idle-fallback');
      },
      false,
    );
    listenEvent('GENERATION_STARTED', beginGeneration, false);
    listenEvent('MESSAGE_SENT', beginGeneration, false);
    listenEvent('STREAM_TOKEN_RECEIVED', noteStreamToken, false);
    listenEvent(
      'GENERATION_ENDED',
      function () {
        finishGeneration('generation-ended');
      },
      false,
    );
    listenEvent(
      'GENERATION_STOPPED',
      function () {
        finishGeneration('generation-stopped');
      },
      false,
    );
  }

  // ==========================================================================
  // Tiêm (Inject) Style
  // ==========================================================================

  function ensureStyle() {
    var id = styleId();
    var style = APP_DOCUMENT.getElementById(id);
    if (!style) {
      style = APP_DOCUMENT.createElement('style');
      style.id = id;
      APP_DOCUMENT.head.appendChild(style);
    }
    style.textContent = [
      /* Container chính —— Midnight biển sâu + Ánh trăng loang lổ */
      '#chat .' +
        NAMESPACE +
        '-fold{display:inline-block;width:auto;max-width:min(100%,32rem);margin:.16rem 0 .22rem;overflow:hidden;vertical-align:middle;position:relative;isolation:isolate;color:rgba(225,235,250,.88);background:linear-gradient(158deg,rgba(4,6,22,.985),rgba(8,14,34,.94),rgba(5,8,18,.97));border:1px solid rgba(140,170,220,.15);border-left:2.5px solid rgba(180,200,235,.28);border-radius:6px 12px 10px 6px;box-shadow:0 2px 24px rgba(20,40,100,.18),0 0 60px rgba(60,100,180,.06),inset 0 1px 0 rgba(180,210,245,.05),inset 0 -1px 0 rgba(20,30,60,.15);font-size:.82em;line-height:1.2;box-sizing:border-box;transition:border-left-color .35s ease,box-shadow .35s ease,border-radius .5s ease}',
      /* Hạt bụi sao —— Bụi vũ trụ bên trong mảnh thủy tinh vỡ */
      '#chat .' +
        NAMESPACE +
        '-fold::before{content:"";position:absolute;inset:0;pointer-events:none;z-index:0;opacity:.035;background-image:radial-gradient(1px 1px at 15% 25%,rgba(200,220,255,.9),transparent),radial-gradient(1px 1px at 45% 70%,rgba(200,220,255,.7),transparent),radial-gradient(1.5px 1.5px at 75% 15%,rgba(180,210,250,.8),transparent),radial-gradient(1px 1px at 85% 55%,rgba(210,230,255,.6),transparent),radial-gradient(2px 2px at 30% 85%,rgba(190,215,245,.5),transparent),radial-gradient(1px 1px at 60% 40%,rgba(200,225,250,.75),transparent);background-size:100% 100%}',
      /* hover —— Thủy tinh đón thêm nhiều ánh trăng */
      '#chat .' +
        NAMESPACE +
        '-fold:hover{border-left-color:rgba(200,220,250,.5);border-radius:8px 14px 12px 8px;box-shadow:0 3px 30px rgba(25,50,120,.24),0 0 72px rgba(70,110,200,.1),inset 0 1px 0 rgba(200,225,250,.08),inset 0 -1px 0 rgba(25,40,70,.2)}',
      /* Cột gập mở */
      '#chat .' +
        NAMESPACE +
        '-summary{position:relative;z-index:1;display:flex;align-items:center;gap:.36rem;min-height:1.44rem;padding:.18rem .56rem .18rem .48rem;cursor:pointer;list-style:none;user-select:none;transition:background .25s ease,padding-left .35s ease}',
      '#chat .' + NAMESPACE + '-summary:hover{background:rgba(160,200,240,.03);padding-left:.56rem}',
      '#chat .' + NAMESPACE + '-summary::marker{content:"";font-size:0}',
      '#chat .' + NAMESPACE + '-summary::-webkit-details-marker{display:none}',
      /* Vùng chứa biểu tượng (Icon container) */
      '#chat .' +
        NAMESPACE +
        '-icon,#chat .' +
        NAMESPACE +
        '-chevron{display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;flex:0 0 14px;overflow:hidden}',
      '#chat .' +
        NAMESPACE +
        '-moon,#chat .' +
        NAMESPACE +
        '-chevron-svg{display:block;width:14px;height:14px;min-width:14px;min-height:14px;max-width:14px;max-height:14px;overflow:hidden}',
      /* Trăng khuyết —— Vầng sáng nhịp thở */
      '#chat .' +
        NAMESPACE +
        '-moon{color:rgba(200,225,250,.9);filter:drop-shadow(0 0 5px rgba(170,210,245,.5)) drop-shadow(0 0 12px rgba(140,190,230,.25));animation:' +
        NAMESPACE +
        '-moon-breathe 4s ease-in-out infinite}',
      '@keyframes ' +
        NAMESPACE +
        '-moon-breathe{0%,100%{filter:drop-shadow(0 0 5px rgba(170,210,245,.5)) drop-shadow(0 0 12px rgba(140,190,230,.25))}50%{filter:drop-shadow(0 0 8px rgba(190,225,250,.65)) drop-shadow(0 0 20px rgba(160,205,240,.35))}}',
      /* chevron —— Mũi tên ánh sao */
      '#chat .' +
        NAMESPACE +
        '-chevron-svg{color:rgba(155,190,225,.55);transition:transform .35s cubic-bezier(.34,1.56,.64,1),color .3s ease}',
      '#chat .' + NAMESPACE + '-summary:hover .' + NAMESPACE + '-chevron-svg{color:rgba(180,210,240,.75)}',
      '#chat .' + NAMESPACE + '-fold[open] .' + NAMESPACE + '-chevron-svg{transform:rotate(90deg)}',
      /* Tiêu đề —— Chữ khắc ánh sao */
      '#chat .' +
        NAMESPACE +
        '-title{display:inline-flex;align-items:baseline;gap:.14rem;white-space:nowrap;color:rgba(215,230,250,.92);font-weight:580;letter-spacing:.04em;text-shadow:0 0 16px rgba(140,185,230,.22),0 0 4px rgba(180,210,240,.1)}',
      /* Thông tin Meta —— Ánh sáng le lói từ ngôi sao xa */
      '#chat .' +
        NAMESPACE +
        '-meta{min-width:0;overflow:hidden;color:rgba(140,170,208,.65);font-size:.78em;text-overflow:ellipsis;white-space:nowrap;opacity:.72;letter-spacing:.015em}',
      /* Khu vực mở rộng nội dung —— Chất cảm thủy tinh */
      '#chat .' +
        NAMESPACE +
        '-body{position:relative;z-index:1;max-height:14rem;overflow-y:auto;border-top:1px solid rgba(120,155,210,.1);background:linear-gradient(180deg,rgba(3,6,16,.55),rgba(5,9,22,.45));padding:.64rem .72rem .32rem;backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px)}',
      '#chat .' + NAMESPACE + '-body::-webkit-scrollbar{width:4px}',
      '#chat .' +
        NAMESPACE +
        '-body::-webkit-scrollbar-thumb{background:rgba(130,170,215,.22);border-radius:999px;transition:background .25s ease}',
      '#chat .' + NAMESPACE + '-body::-webkit-scrollbar-thumb:hover{background:rgba(160,195,230,.38)}',
      /* Đoạn văn */
      '#chat .' + NAMESPACE + '-section{margin:0 0 .56rem 0}',
      '#chat .' + NAMESPACE + '-section:last-child{margin-bottom:.16rem}',
      '#chat .' +
        NAMESPACE +
        '-section-head{display:flex;align-items:center;gap:.4rem;margin-bottom:.3rem;line-height:1.2}',
      /* Nhãn phân loại —— Viên nhộng màu xanh băng */
      '#chat .' +
        NAMESPACE +
        '-kind{flex:0 0 auto;padding:.07rem .42rem;color:rgba(200,222,245,.9);background:rgba(70,110,180,.08);border:1px solid rgba(110,150,200,.16);border-radius:5px 999px 999px 5px;font-size:.75em;font-weight:580;letter-spacing:.04em;text-shadow:0 0 5px rgba(120,170,220,.12)}',
      /* Tên nhãn (Tag name) */
      '#chat .' +
        NAMESPACE +
        '-tag{min-width:0;overflow:hidden;color:rgba(130,165,205,.55);font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:.74em;text-overflow:ellipsis;white-space:nowrap;letter-spacing:.02em}',
      /* Nội dung chính */
      '#chat .' +
        NAMESPACE +
        '-content{color:rgba(205,222,242,.84);line-height:1.65;overflow-wrap:anywhere;white-space:pre-wrap}',
      '#chat .' + NAMESPACE + '-original{display:none!important}',
      '#chat .' + NAMESPACE + '-hidden{display:none!important}',
      /* Chỗ giữ chỗ cho nội dung trống */
      '#chat .' + NAMESPACE + '-empty{color:rgba(110,145,190,.4);font-style:italic}',
      /* Responsive */
      '@media (max-width:600px){#chat .' +
        NAMESPACE +
        '-fold{display:block;width:fit-content;max-width:calc(100vw - 1.6rem);border-radius:5px 10px 8px 5px}#chat .' +
        NAMESPACE +
        '-summary{max-width:100%;padding:.16rem .44rem .16rem .36rem}#chat .' +
        NAMESPACE +
        '-meta{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}}',
    ].join('\n');
  }

  // ==========================================================================
  // Vòng đời
  // ==========================================================================

  function restoreTouchedMessages() {
    var ids = Array.from(state.touchedMessageIds);
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      var container = getTextContainer(id);
      if (!container) continue;
      try {
        state.internalMutationDepth += 1;
        unwrapCot(container);
      } catch (_) {
        /* noop */
      } finally {
        state.internalMutationDepth -= 1;
      }
    }
    state.touchedMessageIds.clear();
  }

  function dispose() {
    state.disposed = true;
    window.clearTimeout(state.renderAllTimer);
    window.clearTimeout(state.streamIdleTimer);
    state.messageTimers.forEach(function (timer) {
      window.clearTimeout(timer);
    });
    state.messageTimers.clear();
    for (var i = 0; i < state.stopList.length; i++) {
      try {
        state.stopList[i]();
      } catch (_) {
        /* noop */
      }
    }
    state.stopList = [];
    restoreTouchedMessages();
    var style = APP_DOCUMENT.getElementById(styleId());
    if (style) style.remove();
  }

// ==========================================================================
// Tự động tiêm nút bấm "Tiếng lòng"
// ==========================================================================

/** Logic bật/tắt tiếng lòng (Trích xuất thành hàm dùng chung để tránh lặp lại) */
var _heartToggleLock = false;
function createHeartToggle() {
  return function () {
    if (_heartToggleLock) return;
    _heartToggleLock = true;
    setTimeout(function () { _heartToggleLock = false; }, 100);
    SEPARATE_HEART = !SEPARATE_HEART;
    try {
      if (typeof replaceVariables === 'function') {
        replaceVariables({ separateHeart: SEPARATE_HEART }, { type: 'script', script_id: getScriptId() });
      }
    } catch (_) { /* noop */ }
    renderAllNow('heart-toggle');
    try {
      if (typeof toastr !== 'undefined' && toastr.success) {
        toastr.success('Tách biệt tiếng lòng ' + (SEPARATE_HEART ? 'đã bật' : 'đã tắt'));
      } else {
        console.log('[Tiểu COT] Tách biệt tiếng lòng ' + (SEPARATE_HEART ? 'đã bật' : 'đã tắt'));
      }
    } catch (_) {}
  };
}

function injectHeartButton() {
  try {
    var buttonName = 'Tiếng lòng';
    var heartToggle = createHeartToggle();
    var buttonConfig = {
      name: buttonName,
      visible: true,
      description: 'Bật/tắt việc tách biệt tiếng lòng thành mục gập mở độc lập',
      exec: heartToggle,
    };

    // ---------- Đăng ký bằng registerScriptButton (Khuyến nghị) ----------
    // Đăng ký nút bấm vào hệ thống để getButtonEvent có thể tìm thấy tên sự kiện.
    // Việc liên kết sự kiện được xử lý thống nhất bởi bindToggleHeartButton.
    if (typeof registerScriptButton === 'function') {
      var eventName = registerScriptButton(buttonName, buttonConfig);
      if (eventName) {
        console.log('[Tiểu COT] Nút bấm tiếng lòng đã được đăng ký (registerScriptButton) tên sự kiện=' + eventName);
      } else {
        console.warn('[Tiểu COT] registerScriptButton trả về tên sự kiện trống');
      }
      return;
    }

    // ---------- Tiêm bằng replaceScriptButtons (Khôi phục) ----------
    var existingButtons = typeof getScriptButtons === 'function' ? getScriptButtons() : [];
    if (existingButtons.some(function (b) { return b.name === buttonName; })) {
      console.log('[Tiểu COT] Nút bấm tiếng lòng đã tồn tại, bỏ qua việc tiêm');
      return;
    }

    var allButtons = typeof getScriptButtons === 'function' ? getScriptButtons() : [];
    allButtons.push(buttonConfig);
    if (typeof replaceScriptButtons === 'function') {
      replaceScriptButtons(allButtons);
      console.log('[Tiểu COT] Nút bấm tiếng lòng đã được tiêm (replaceScriptButtons), vui lòng đảm bảo tạo nút bấm thủ công để thuận tiện cho việc liên kết sự kiện');
    } else {
      console.warn('[Tiểu COT] replaceScriptButtons không khả dụng, không thể tự động tiêm nút bấm');
    }
  } catch (error) {
    logWarn('Tiêm nút bấm tiếng lòng thất bại', error);
  }
}
function init() {
  ensureStyle();
  cleanupFrontendCodeLabels();
  exposeDebugApi();
  bindEvents();
  injectHeartButton(); // Đăng ký nút bấm vào hệ thống trước
  bindToggleHeartButton(); // Sau đó liên kết sự kiện thông qua getButtonEvent
  startDomObserver();
  startStartupScanLoop();
  for (var i = 0; i < INIT_RENDER_DELAYS.length; i++) {
    scheduleDisplayedMessages(INIT_RENDER_DELAYS[i], 'init');
  }
  window.addEventListener('pagehide', dispose, { once: true });
  console.warn('[Tiểu COT V4] Phiên bản nâng cao tách biệt tiếng lòng Sẵn sàng');
}

  // ---------- Khởi động ----------
  function ready(fn) {
    if (APP_DOCUMENT.readyState === 'loading') {
      APP_DOCUMENT.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  ready(function () {
    var run = typeof errorCatched === 'function' ? errorCatched(init) : init;
    run();
  });
})();