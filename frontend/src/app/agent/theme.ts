import { DOCUMENT, Injectable, inject, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class Theme {
  private readonly document = inject(DOCUMENT);
  private readonly _accent = signal<string | null>(null);

  /** The accent color set at runtime, or `null` while the stylesheet default applies. */
  readonly accent = this._accent.asReadonly();

  /** Applies a CSS color as the accent. Returns `false` when the value is not a valid color. */
  setAccent(color: string): boolean {
    if (!CSS.supports('color', color)) {
      return false;
    }
    this.document.documentElement.style.setProperty('--accent', color);
    this._accent.set(color);
    return true;
  }
}
