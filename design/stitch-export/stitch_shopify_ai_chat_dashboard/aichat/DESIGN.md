---
name: AIChat
colors:
  surface: '#f6fafe'
  surface-dim: '#d7dadf'
  surface-bright: '#f6fafe'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f1f4f8'
  surface-container: '#ebeef3'
  surface-container-high: '#e5e8ed'
  surface-container-highest: '#dfe3e7'
  on-surface: '#181c1f'
  on-surface-variant: '#3d4a42'
  inverse-surface: '#2d3134'
  inverse-on-surface: '#eef1f5'
  outline: '#6d7a71'
  outline-variant: '#bccac0'
  surface-tint: '#006c49'
  primary: '#006c49'
  on-primary: '#ffffff'
  primary-container: '#12a875'
  on-primary-container: '#003421'
  inverse-primary: '#5ddda5'
  secondary: '#396756'
  on-secondary: '#ffffff'
  secondary-container: '#bbedd7'
  on-secondary-container: '#3f6d5c'
  tertiary: '#006c4a'
  on-tertiary: '#ffffff'
  tertiary-container: '#46a47c'
  on-tertiary-container: '#003421'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#7bfac0'
  primary-fixed-dim: '#5ddda5'
  on-primary-fixed: '#002113'
  on-primary-fixed-variant: '#005236'
  secondary-fixed: '#bbedd7'
  secondary-fixed-dim: '#a0d1bc'
  on-secondary-fixed: '#002117'
  on-secondary-fixed-variant: '#204f3f'
  tertiary-fixed: '#97f5c8'
  tertiary-fixed-dim: '#7bd9ad'
  on-tertiary-fixed: '#002114'
  on-tertiary-fixed-variant: '#005237'
  background: '#f6fafe'
  on-background: '#181c1f'
  surface-variant: '#dfe3e7'
typography:
  display-lg:
    fontFamily: Inter, -apple-system, system-ui
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.02em
  heading-lg:
    fontFamily: Inter, -apple-system, system-ui
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  heading-md:
    fontFamily: Inter, -apple-system, system-ui
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
  body-md:
    fontFamily: Inter, -apple-system, system-ui
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter, -apple-system, system-ui
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  label-md:
    fontFamily: Inter, -apple-system, system-ui
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  gutter: 20px
---

## Brand & Style
The design system is a specialized extension of the Shopify Polaris framework, optimized for a merchant-facing AI customer service platform. The brand personality is "Green Tech"—marrying the reliability of enterprise SaaS with the forward-leaning innovation of artificial intelligence. 

The visual style is **Corporate / Modern** with a focus on high-fidelity clarity. It utilizes a clean, white-label aesthetic that feels native to the Shopify Admin while introducing a distinct tech-forward energy through its primary green palette. The UI should evoke efficiency, intelligence, and transparency. Key characteristics include high-contrast typography for bilingual readability (English and Chinese), ample whitespace to reduce cognitive load in complex dashboards, and crisp linear iconography.

## Colors
This design system employs a functional palette rooted in "Green Tech" vitality.

- **Primary & Actions:** The primary green (`#12A875`) is used for call-to-actions, primary buttons, and active states. Use the darker hover state (`#0A7A55`) for interactive feedback.
- **Deep Accents:** The deep forest green (`#0A3D2E`) is reserved for high-emphasis states, such as sidebar selections in a collapsed state or critical AI performance metrics.
- **Surfaces:** Adheres to the standard Shopify environment with a light gray page background (`#F6F7F9`) and pure white (`#FFFFFF`) for cards and surface containers to ensure depth and separation.
- **Feedback:** Semantic colors follow standard accessibility patterns. The primary green doubles as the success state, ensuring brand-message alignment.

## Typography
The system uses `Inter` as the primary typeface, falling back to system sans-serifs for seamless integration with the Shopify Admin. 

**Bilingual Handling:**
- For **Traditional/Simplified Chinese**, ensure a line-height increase of approximately 15% compared to English-only layouts to prevent character crowding. 
- Avoid font weights below 400 for Chinese characters to maintain legibility on low-DPI merchant displays.
- Use `heading-md` for standard card titles and `body-md` for the majority of merchant-facing data and chat transcripts.

## Layout & Spacing
This design system follows a **Fixed-Fluid Hybrid** grid. The side navigation and sidebar panels (like the AI chat history) remain fixed, while the main content area expands.

- **Grid:** A 12-column grid system is used for dashboard layouts.
- **Rhythm:** All margins and paddings must be multiples of the 4px base unit.
- **Breakpoints:**
  - **Mobile (<768px):** Single column, 16px horizontal margins. 
  - **Tablet (768px - 1024px):** 2-column layouts for split-screen chat monitoring.
  - **Desktop (>1024px):** Standard Shopify page width (max-width: 1600px for wide data tables).

## Elevation & Depth
The system uses **Tonal Layers** supplemented by very subtle ambient shadows to define hierarchy without cluttering the interface.

- **Level 0 (Background):** `#F6F7F9` – The canvas.
- **Level 1 (Cards/Surfaces):** White background with a `1px` solid border (`#E1E3E5`). No shadow is used for standard cards to maintain the "flat" Polaris look.
- **Level 2 (Popovers/Modals):** White background with a soft, diffused shadow: `0 4px 12px rgba(0, 0, 0, 0.08)`.
- **In-Chat Depth:** User message bubbles use the primary color with white text, while AI responses use a light gray surface (`#EDEEEF`) to distinguish "The Machine" from "The Human."

## Shapes
The shape language is sophisticated and modern, moving slightly away from the rigid corners of traditional enterprise software to reflect the "friendly" nature of an AI assistant.

- **Primary Elements:** Buttons and Input fields use an **8px (0.5rem)** radius for a professional, sturdy feel.
- **Containers:** Main dashboard cards and surfaces use a **12px** radius to soften the layout and group related information effectively.
- **Conversational Elements:** Chat bubbles utilize a **16px** radius. When messages are grouped, the "middle" bubbles should have a reduced radius on the trailing side to visually cluster the conversation.

## Components

### Buttons
- **Primary:** Background `#12A875`, white text, 8px radius. Use for "Save," "Send," and "Connect."
- **Secondary:** Transparent background, `#12A875` border and text.
- **Icons:** Use linear, 20px icons with a 1.5px stroke weight.

### Input Fields
- **Standard:** 8px radius, white background, `1px` border (`#C9CCCF`). On focus, the border shifts to `#12A875` with a 2px outer "halo" at 20% opacity.

### Cards
- **Merchant Dashboard Card:** 12px radius, white surface, subtle `1px` border. Titles should be `heading-md` in the Deep Accent color (`#0A3D2E`).

### AI Chat Interface
- **Message Bubbles:** User bubbles are Primary Green. AI bubbles are Light Gray (`#EDEEEF`).
- **Status Indicators:** Use small pulsing dots (Primary Green) to indicate "AI is typing" or "Processing."

### Chips / Tags
- **Status Tags:** Use a light tint of the status color (e.g., 10% opacity) for the background and the full-strength color for text. Radius should be set to "Pill" (100px) to distinguish them from actionable buttons.