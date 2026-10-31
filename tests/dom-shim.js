var __children = [];
var document = { title: '', querySelector: function(sel){ return sel === '.lyrics-scroll' ? { children: __children } : null; }, querySelectorAll: function(){ return []; } };
function lab(t){ return { className: 'pt-1 text-xs font-semibold uppercase', innerText: t, textContent: t }; }
function s(t){ return { className: 'whitespace-pre-line', innerText: t, textContent: t }; }
function M(){ var t = Array.prototype.slice.call(arguments).join('\n'); return { className: 'whitespace-pre-line', innerText: t, textContent: t }; }
