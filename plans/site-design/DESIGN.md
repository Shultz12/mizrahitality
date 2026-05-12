---
name: Warm Minimalist System
colors:
  surface: '#fdf8f7'
  surface-dim: '#ddd9d8'
  surface-bright: '#fdf8f7'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f7f3f1'
  surface-container: '#f1edec'
  surface-container-high: '#ebe7e6'
  surface-container-highest: '#e5e2e0'
  on-surface: '#1c1b1b'
  on-surface-variant: '#474741'
  inverse-surface: '#313030'
  inverse-on-surface: '#f4f0ef'
  outline: '#787770'
  outline-variant: '#c8c7be'
  surface-tint: '#5f5e5b'
  primary: '#5f5e5b'
  on-primary: '#ffffff'
  primary-container: '#faf7f2'
  on-primary-container: '#72716d'
  inverse-primary: '#c8c6c2'
  secondary: '#635d58'
  on-secondary: '#ffffff'
  secondary-container: '#e7ded8'
  on-secondary-container: '#67625d'
  tertiary: '#615d5e'
  on-tertiary: '#ffffff'
  tertiary-container: '#fdf6f7'
  on-tertiary-container: '#757071'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e5e2dd'
  primary-fixed-dim: '#c8c6c2'
  on-primary-fixed: '#1c1c19'
  on-primary-fixed-variant: '#474743'
  secondary-fixed: '#eae1db'
  secondary-fixed-dim: '#cdc5bf'
  on-secondary-fixed: '#1f1b17'
  on-secondary-fixed-variant: '#4b4641'
  tertiary-fixed: '#e7e1e2'
  tertiary-fixed-dim: '#cbc5c6'
  on-tertiary-fixed: '#1d1b1c'
  on-tertiary-fixed-variant: '#494647'
  background: '#fdf8f7'
  on-background: '#1c1b1b'
  surface-variant: '#e5e2e0'
  bg-primary-light: '#FAF7F2'
  bg-primary-dark: '#141210'
  text-main: '#2C2824'
  text-on-dark: '#FAF7F2'
  accent-coral: '#E85D4A'
typography:
  h1-desktop:
    fontFamily: Playfair Display
    fontSize: 64px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  h1-mobile:
    fontFamily: Playfair Display
    fontSize: 40px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -0.01em
  h2-desktop:
    fontFamily: Playfair Display
    fontSize: 48px
    fontWeight: '600'
    lineHeight: '1.2'
  h2-mobile:
    fontFamily: Playfair Display
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.25'
  h3:
    fontFamily: Playfair Display
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.3'
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  label-caps:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: '1.0'
    letterSpacing: 0.1em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  container-max: 1200px
  margin-mobile: 24px
  margin-desktop: 80px
  gutter: 24px
  section-gap: 120px
---

# Design System Constraints

Initialize a new project using the following strict design system parameters. Do not deviate from these constraints.

## Typography
* **Headings (H1, H2, H3):** Playfair Display (Weight 600-700)
* **Body & UI Elements:** Inter
* **Mobile Accessibility:** All body text must have a strict minimum font size of 16px to prevent iOS auto-zooming.

## Color Palette (60-30-10 Rule)
* **Primary Background (60%):** `#FAF7F2` (Warm off-white) or `#141210` (Dark mode)
* **Typography/Text (30%):** `#2C2824` (Warm charcoal)
* **Accent/CTA (10%):** `#E85D4A` (Warm Coral) - *Strict Constraint: This must be the ONLY highly saturated color on the screen.*

## Global Layout Constraints
* **Architecture:** Mobile-first Server-Side Rendered (SSR) structure.
* **Media:** The layout must support exactly one high-quality hero image per page.
* **Navigation:** Zero top navigation menus, zero footer links, and zero social icons.