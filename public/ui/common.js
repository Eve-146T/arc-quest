export const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
export const icon = (name, cls = '') => `<svg class="icon ${cls}" aria-hidden="true"><use href="#${name}"/></svg>`;
export const safeRead = (key, fallback) => {try {return JSON.parse(localStorage.getItem(key)) ?? fallback;} catch {return fallback;}};
export const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const ARC = ['#FFFFFF', '#CCCCCC', '#999999', '#666666', '#333333', '#000000', '#E53AA3', '#FF7BCC', '#F93C31', '#1E93FF', '#88D8F1', '#FFDC00', '#FF851B', '#921231', '#4FCC30', '#A356D6'];
export const CANDY = ['#1E93FF', '#FFDC00', '#4FCC30', '#F93C31', '#A356D6', '#FF851B', '#88D8F1', '#E53AA3', '#2EE6A6'];

