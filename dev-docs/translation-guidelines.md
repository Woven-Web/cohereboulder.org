# Translation System Guidelines

## Overview

This document explains how to use and maintain the translation system in the COhere Boulder website.

## Architecture

### 1. Language Context (`src/contexts/LanguageContext.tsx`)
- Provides global language state management
- Offers two translation methods:
  - `t(en, es)` - Inline translations for quick use
  - `tr(path)` - Centralized translations using path notation

### 2. Centralized Translations (`src/lib/translations.ts`)
- Single source of truth for all translations
- Organized by sections and components
- Easy to maintain and update

## How to Add New Translations

### Method 1: Centralized (Recommended)

1. **Add to translations.ts:**
```typescript
export const translations = {
  mySection: {
    myText: {
      en: "English text",
      es: "Spanish text"
    }
  }
};
```

2. **Use in component:**
```tsx
const { tr } = useLanguage();
return <p>{tr("mySection.myText")}</p>;
```

### Method 2: Inline (For one-off text)

```tsx
const { t } = useLanguage();
return <p>{t("English text", "Texto en español")}</p>;
```

## Best Practices

### 1. Organization
- Group translations by page/component
- Use descriptive nested paths
- Keep related translations together

### 2. Consistency
- Always provide both English and Spanish
- Use consistent terminology across translations
- Match the tone and formality level

### 3. Maintenance
- When adding new features, immediately add translations
- Test both languages before deploying
- Keep translations.ts alphabetically organized

## Common Patterns

### Navigation Items
```typescript
nav: {
  about: { en: "About", es: "Acerca de" },
  calendar: { en: "Calendar", es: "Calendario" }
}
```

### Form Labels
```typescript
forms: {
  name: { en: "Name", es: "Nombre" },
  email: { en: "Email", es: "Correo electrónico" },
  submit: { en: "Submit", es: "Enviar" }
}
```

### Dates
```typescript
dates: {
  october: { en: "October", es: "Octubre" },
  dateFormat: { en: "October 16, 2025", es: "16 de Octubre, 2025" }
}
```

## Adding Translations to New Pages

1. **Import the hook:**
```tsx
import { useLanguage } from "@/contexts/LanguageContext";
```

2. **Use in component:**
```tsx
const MyComponent = () => {
  const { tr } = useLanguage();

  return (
    <div>
      <h1>{tr("pageTitle")}</h1>
      <p>{tr("pageDescription")}</p>
    </div>
  );
};
```

3. **Add translations to translations.ts:**
```typescript
pageTitle: { en: "Page Title", es: "Título de Página" },
pageDescription: { en: "Description", es: "Descripción" }
```

## Language Toggle Component

The language toggle is in the Navigation component:
- Globe icon button that switches between EN/ES
- Updates all text instantly across the site
- State persists during the session

## Testing Translations

1. **Manual Testing:**
   - Click the globe icon to switch languages
   - Verify all text changes appropriately
   - Check for missing translations (will show the path as fallback)

2. **Finding Missing Translations:**
   - If you see a dot-notation path (e.g., "section.text") instead of translated text, that translation is missing
   - Check browser console for warnings about missing translations

## Common Spanish Translation Patterns

### Formal vs Informal
- Use "usted" form for formal communication
- Current site uses informal "tú" for community feel

### Common Phrases
- "Join" → "Únete" (informal) or "Únase" (formal)
- "Learn More" → "Aprende Más"
- "Community" → "Comunidad"
- "Connect" → "Conectar"
- "Weaving" → "Tejiendo/Tejido"

## Troubleshooting

### Translation Not Showing
1. Check that the path is correct
2. Verify both languages are defined in translations.ts
3. Ensure component is using the correct hook method

### Language Not Switching
1. Verify LanguageProvider wraps the app
2. Check that component is using useLanguage hook
3. Clear browser cache and reload

## Future Improvements

### Potential Enhancements
1. **Persist Language Preference:** Save to localStorage
2. **URL-based Language:** Add /es/ or ?lang=es
3. **Auto-detect Browser Language:** Set initial language based on browser
4. **Translation Management Tool:** Consider i18n library for larger scale

### Adding More Languages
1. Update Language type in LanguageContext
2. Extend translations object structure
3. Update toggle UI for multiple languages

## Checklist for New Features

- [ ] Add all user-facing text to translations.ts
- [ ] Use tr() or t() for all text rendering
- [ ] Test in both English and Spanish
- [ ] Update this documentation if adding new patterns
- [ ] Ensure consistent terminology with existing translations

## Examples of Complete Components

See these files for reference:
- `src/pages/Index.tsx` - Fully translated homepage
- `src/components/Navigation.tsx` - Translated navigation with toggle
- `src/components/Footer.tsx` - Translated footer
- `src/pages/Join2025.tsx` - Page with comprehensive translations

## Contact

For questions about translations or to report missing translations, please check with the development team or create an issue in the repository.
