---
name: Pragmatic Utility System
colors:
  surface: '#FFFFFF'
  surface-dim: '#dcd9db'
  surface-bright: '#fcf8fa'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f6f3f5'
  surface-container: '#f0edef'
  surface-container-high: '#eae7e9'
  surface-container-highest: '#e4e2e4'
  on-surface: '#1b1b1d'
  on-surface-variant: '#45464d'
  inverse-surface: '#303032'
  inverse-on-surface: '#f3f0f2'
  outline: '#76777d'
  outline-variant: '#c6c6cd'
  surface-tint: '#565e74'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#131b2e'
  on-primary-container: '#7c839b'
  inverse-primary: '#bec6e0'
  secondary: '#585f6c'
  on-secondary: '#ffffff'
  secondary-container: '#dce2f3'
  on-secondary-container: '#5e6572'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#271901'
  on-tertiary-container: '#98805d'
  error: '#DC2626'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dae2fd'
  primary-fixed-dim: '#bec6e0'
  on-primary-fixed: '#131b2e'
  on-primary-fixed-variant: '#3f465c'
  secondary-fixed: '#dce2f3'
  secondary-fixed-dim: '#c0c7d6'
  on-secondary-fixed: '#151c27'
  on-secondary-fixed-variant: '#404754'
  tertiary-fixed: '#fcdeb5'
  tertiary-fixed-dim: '#dec29a'
  on-tertiary-fixed: '#271901'
  on-tertiary-fixed-variant: '#574425'
  background: '#fcf8fa'
  on-background: '#1b1b1d'
  surface-variant: '#e4e2e4'
  canvas: '#F9FAFB'
  border-subtle: '#E5E7EB'
  text-primary: '#111827'
  text-muted: '#6B7280'
  success: '#059669'
typography:
  page-title:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  section-header:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '500'
    lineHeight: 24px
  body-base:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  input-text:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  helper-text:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  margin-mobile: 16px
  margin-desktop: 32px
  gutter: 16px
---

# Application Design System Constraints

Initialize the application UI using the following pragmatic, utility-driven design parameters. The goal is a low-friction, technophobe-friendly environment that feels stable and professional.

## Typography
* **Global Font Family:** Inter (or system-ui). Use a single sans-serif family to reduce visual noise.
* **Hierarchy:** 
  * Page Titles: 24px, Semi-Bold.
  * Section Headers: 16px, Medium.
  * Body/Inputs: 14px, Regular.
* **Accessibility:** Form labels must be explicitly linked and visible. Minimum tap target for interactive elements is 44x44px.

## Color Palette (High Contrast, Low Saturation)
* **Background (App Canvas):** `#F9FAFB` (Very light gray) to reduce eye strain during prolonged use.
* **Surface (Cards, Modals, Forms):** `#FFFFFF` (Pure white) with a subtle 1px border (`#E5E7EB`) rather than heavy drop shadows.
* **Text:** `#111827` (Near black) for primary data/headings. `#6B7280` (Muted gray) for helper text and secondary labels.
* **Primary Action:** `#0F172A` (Deep Slate) for primary buttons. Professional, grounded, and non-promotional.
* **Feedback States:** Muted standard colors (e.g., `#059669` for success, `#DC2626` for errors).

## Global UI Constraints
* **Forms:** Inputs must have a clearly defined border, a visible label above the field, and a dedicated slot for validation messages below.
* **Corners:** Subtle rounding (`border-radius: 6px`) to feel modern but structured.
* **Animation:** Restricted to micro-interactions only (e.g., a fast `150ms` ease-in-out on button hover or focus rings). No layout shifts or decorative animations.