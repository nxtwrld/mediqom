# Mobile Responsive Strategy for Mediqom UI Layout

> **Status:** Implemented (living bar) · **Type:** Architecture · **Verified:** 2026-10-30
> **Built:** `src/components/layout/UI.svelte` (mobile, ≤768px), `src/components/layout/NavBar.svelte` (desktop), `src/components/layout/ProfileSectionTabs.svelte` · **Prototype:** https://claude.ai/artifact/H8zk6DWN62Yd9jKKnD1zA5

> **Current reality (2026-10-30): the "living bar".**
> - **Mobile bar** (bottom floating pill): pages on the left (**Docs** → Documents | Medications, **Doctors** → Contacts | Appointments, as route tabs via `ProfileSectionTabs`), the profile avatar in the centre (→ profile overview; tap again to scroll to top), the name chip ▾ under it (→ profile switcher sheet), layers on the right (**Explore**, **Ask AI**).
> - **Layers** (`panelView`: `profiles` | `explore` | `chat`): the pill grows upward so the bar rides on top of the sheet. The opening button turns into **Close**. One layer at a time; Explore and Ask swap in place. Close via the button, swipe down, backdrop tap, Esc or the Android back button.
> - **Explore** hosts `Viewer.svelte` with an Anatomy | Timeline switch at the bottom. **Ask** mounts `AIChatSidebar` with `variant="sheet"` inside the panel; the chat store and the sheet are kept in sync, so `chat:ask_about` from anywhere opens the sheet.
> - **Import** has no overlay any more: every `overlay.import` emit navigates to `/med/p/{id}/documents?import=1`, where `ImportView` renders inline. A ring on the Docs icon shows running import progress, a dot shows jobs ready to review.
> - **Desktop** keeps the 3-column layout: breadcrumb `PROFILES › avatar + name`, page links, an **Explore** toggle (left viewer panel with the same Anatomy | Timeline switch) and the AI chat button (right panel).
>
> The options analysis below is kept as design background.

## Current Desktop Layout Analysis

**3-Column Desktop Layout:**

- **Left**: Anatomy Viewer (resizable, 20-50vw, default 33vw)
- **Center**: Document Content (flexible width)
- **Right**: AI Chat Sidebar (resizable, 300-800px, default 400px)

**Current Mobile Issues (≤768px):**

- Viewer remains at desktop width (33vw = ~240px on mobile)
- Content gets pushed into remaining ~136px space
- Text becomes unreadable and UI elements unusable
- No touch-friendly resize options
- Chat overlay works but viewer layout doesn't

---

## Mobile Layout Strategy Options

### **Option 1: Tab-Based Mobile Interface**

**Implementation:**

- Convert 3-column layout to tabbed interface on mobile
- Tabs: "Document" | "Anatomy" | "Chat"
- Full-screen each section when selected
- Tab bar at bottom or top for easy switching

**Pros:**
✅ Each section gets full screen real estate
✅ Clear, familiar mobile UX pattern
✅ Easy to implement with existing components
✅ No content squashing issues
✅ Touch-friendly navigation

**Cons:**
❌ No simultaneous viewing of content
❌ Context switching required for anatomy reference
❌ Loses desktop workflow advantages
❌ May require additional state management

**Mobile UX Flow:**

1. User opens document (default tab)
2. Taps "Anatomy" to view 3D model full-screen
3. Taps "Chat" for AI assistance
4. Can quickly switch between tabs

---

### **Option 2: Modal/Overlay System**

**Implementation:**

- Document content remains primary view
- Anatomy viewer opens as full-screen modal
- Chat remains as slide-in overlay from right
- "View Anatomy" buttons trigger modal

**Pros:**
✅ Maintains document as primary focus
✅ Full-screen anatomy experience
✅ Chat integration remains smooth
✅ Less disruptive to existing layout
✅ Modal can be dismissed easily

**Cons:**
❌ Anatomy not quickly accessible
❌ Modal might feel disconnected from content
❌ Additional modal management complexity
❌ Less discoverable than tabs

**Mobile UX Flow:**

1. User reads document content
2. Taps anatomy button → full-screen modal opens
3. Interacts with 3D model
4. Closes modal to return to document
5. Can open chat overlay independently

---

### **Option 3: Collapsible Panels System**

**Implementation:**

- All three sections available but collapsible
- Accordion-style: only one expanded at a time
- Quick expand/collapse buttons
- Smooth animations between states

**Pros:**
✅ All sections remain visible/accessible
✅ User controls what to focus on
✅ Smooth transitions
✅ Maintains layout structure concept

**Cons:**
❌ Still requires careful width management
❌ Complex animation states
❌ May still feel cramped
❌ Accordion behavior might confuse users

**Mobile UX Flow:**

1. Default: document expanded, others collapsed
2. Tap viewer header → expands viewer, collapses document
3. Tap chat header → expands chat, collapses others
4. Headers always visible for quick switching

---

### **Option 4: Swipe-Based Carousel**

**Implementation:**

- Three sections as carousel slides
- Swipe left/right to navigate
- Indicator dots show current section
- Optional preview of adjacent sections

**Pros:**
✅ Natural mobile gesture (swipe)
✅ Full screen for each section
✅ Visual continuity between sections
✅ Gesture-based, no buttons needed

**Cons:**
❌ Hidden sections not immediately apparent
❌ Swipe gestures might conflict with content
❌ Less precise than button navigation
❌ Discovery issues for new users

**Mobile UX Flow:**

1. Document view (default)
2. Swipe left → Anatomy viewer
3. Swipe left → Chat interface
4. Swipe right to go back
5. Dots indicate position

---

### **Option 5: Hybrid Bottom Sheet System**

**Implementation:**

- Document content as main view
- Anatomy as bottom sheet (drawer from bottom)
- Chat as side sheet (drawer from right)
- Pull handles and gesture support

**Pros:**
✅ Document remains primary
✅ Natural mobile drawer patterns
✅ Anatomy can be partially visible
✅ Gesture-friendly
✅ Multiple simultaneous views possible

**Cons:**
❌ Anatomy viewer might be cramped in bottom sheet
❌ Complex gesture handling
❌ State management for multiple sheets
❌ Potential UI conflicts

**Mobile UX Flow:**

1. Document in main view
2. Pull up from bottom → anatomy sheet opens
3. Swipe from right → chat sheet opens
4. Sheets can be resized with pull handles
5. Tap outside sheets to close

---

### **Option 6: Smart Responsive Stacking**

**Implementation:**

- Maintain 3-column on larger mobile (≥600px)
- Stack to single column on smaller mobile (≤599px)
- Context-aware prioritization
- Smart showing/hiding based on usage

**Pros:**
✅ Adapts to device capabilities
✅ Utilizes larger mobile screens effectively
✅ Progressive enhancement approach
✅ Least disruptive to existing code

**Cons:**
❌ Still has cramped feeling on larger mobile
❌ Complex breakpoint management
❌ May not solve core usability issues
❌ Stacking might be jarring

**Mobile UX Flow:**

1. Large mobile: compressed 3-column
2. Small mobile: stacked single column
3. Priority: Document → Chat → Anatomy
4. Fixed header with section toggles

---

## Recommended Implementation Strategy

### **Primary Recommendation: Option 1 (Tab-Based) + Option 2 (Modal) Hybrid**

**Rationale:**

- **Tab-based for primary navigation** (Document/Chat tabs)
- **Modal anatomy viewer** triggered from document content
- **Best of both approaches** without complexity

**Implementation Plan:**

#### **Phase 1: Mobile Tab System**

```html
<!-- Mobile only: ≤768px -->
<div class="mobile-tabs">
  <button class="tab active">Document</button>
  <button class="tab">Chat</button>
</div>

<div class="mobile-content">
  <!-- Tab content here -->
</div>
```

#### **Phase 2: Modal Anatomy Integration**

```html
<!-- Anatomy buttons in document trigger modal -->
<button onclick="openAnatomyModal('spine')" class="anatomy-trigger-mobile">
  View Spine Model
</button>

<!-- Full-screen anatomy modal -->
<div class="anatomy-modal-mobile">
  <Viewer />
</div>
```

#### **Phase 3: Enhanced Mobile Features**

- Swipe gestures between tabs
- Touch-optimized anatomy controls
- Mobile-specific chat interface improvements

---

## Technical Implementation Details

### **CSS Strategy**

```css
/* Mobile-first approach */
@media (max-width: 768px) {
  .layout {
    display: flex;
    flex-direction: column;
  }

  .mobile-tabs {
    position: fixed;
    bottom: 0;
    width: 100%;
    z-index: 1000;
  }
}
```

### **State Management**

- Add mobile layout state to UI store
- Track active mobile tab
- Manage modal states
- Preserve desktop functionality

### **Component Updates Needed**

1. **UI.svelte**: Mobile layout detection and tab system
2. **DocumentView.svelte**: Mobile anatomy button triggers
3. **Viewer.svelte**: Full-screen modal mode
4. **AIChatSidebar.svelte**: Tab integration
5. **CSS files**: Mobile-specific styles

---

## Breakpoint Strategy

### **Proposed Breakpoints**

- **≥1024px**: Full 3-column desktop layout
- **768px-1023px**: Compressed 3-column (tablet landscape)
- **600px-767px**: 2-column (tablet portrait)
- **≤599px**: Mobile tab system

### **Progressive Enhancement**

1. Start with mobile-first design
2. Enhance for larger screens
3. Maintain touch-first approach
4. Graceful degradation for older browsers

---

## Next Steps

1. **Validate approach** with stakeholders
2. **Create mobile prototypes** for user testing
3. **Implement Phase 1** (tab system)
4. **Test on real devices** across different sizes
5. **Iterate based on feedback**
6. **Roll out progressively** with feature flags

---

## Success Metrics

### **Mobile Usability Goals**

- [ ] Document content readable without horizontal scrolling
- [ ] Anatomy viewer usable with touch gestures
- [ ] Chat interface maintains full functionality
- [ ] Navigation intuitive for mobile users
- [ ] Performance remains smooth on mobile devices
- [ ] Accessibility maintained across all breakpoints

**Target: 90%+ mobile usability score in user testing**
