const R_COMMENTS_CLASS_PREFIX = "_rcomments_";

// Cache for decoded HTML to avoid repeated DOM operations
const decodedHtmlCache = new Map<string, string>();

/**
 * Decodes HTML entities in a string
 * Uses caching to avoid repeated DOM operations
 */
export function decodeHTML(html: string): string {
  if (!html) return '';
  
  // Check cache first
  if (decodedHtmlCache.has(html)) {
    return decodedHtmlCache.get(html);
  }
  
  const txt = window.document.createElement("textarea");
  txt.innerHTML = html;
  const result = txt.value;
  
  // Cache the result (limit cache size to prevent memory issues)
  if (decodedHtmlCache.size > 100) {
    // Remove oldest entry when cache gets too large
    const firstKey = decodedHtmlCache.keys().next().value;
    decodedHtmlCache.delete(firstKey);
  }
  decodedHtmlCache.set(html, result);
  
  return result;
}

/**
 * Returns the first parent element of el that satisfies given selector
 * Uses early return pattern for better readability and performance
 */
export function getFirstParent(
  el: HTMLElement,
  selector: string
): HTMLElement | false {
  if (!el || !el.parentElement) {
    return false;
  }
  
  if (el.parentElement.matches(selector)) {
    return el.parentElement;
  }
  
  return getFirstParent(el.parentElement, selector);
}

/**
 * Gets all parent elements matching a selector
 * Optimized to avoid unnecessary iterations
 */
export function getParents(el: Element, selector: string): HTMLElement[] {
  const parents = [];
  
  if (!el || !selector) return parents;
  
  let currentEl = el.parentElement;
  
  while (currentEl && currentEl.matches) {
    if (currentEl.matches(selector)) {
      parents.push(currentEl);
    }
    currentEl = currentEl.parentElement;
  }
  
  return parents;
}

/**
 * Adds the rComments class prefix to a class name
 */
export function classed(classes: string): string {
  return R_COMMENTS_CLASS_PREFIX + classes;
}

/**
 * Creates a CSS selector with the rComments class prefix
 */
export function classedSelector(classes: string): string {
  return "." + R_COMMENTS_CLASS_PREFIX + classes;
}

/**
 * Checks if an element has a specific class with the rComments prefix
 */
export function hasClass(element: Element, className: string): boolean {
  return element.classList.contains(classed(className));
}

/**
 * Adds a class with the rComments prefix to an element
 */
export function addClass(element: Element, className: string): void {
  element.classList.add(classed(className));
}

/**
 * Removes a class with the rComments prefix from an element
 */
export function removeClass(element: Element, className: string): void {
  element.classList.remove(classed(className));
}

/**
 * Toggles a class with the rComments prefix on an element
 */
export function toggleClass(element: Element, className: string): void {
  element.classList.toggle(classed(className));
}
