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