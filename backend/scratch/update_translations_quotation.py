import os
import json

locales_dir = r"c:\Users\shiva\Desktop\sem6\bidflow\frontend\src\locales"

translations = {
    "en": {
        "exportQuote": "Export Quote",
        "quoteExportSuccess": "Quotation PDF exported successfully!",
        "quoteExportFailed": "Failed to export quotation PDF"
    },
    "hi": {
        "exportQuote": "कोटेशन निर्यात करें",
        "quoteExportSuccess": "कोटेशन पीडीएफ सफलतापूर्वक निर्यात किया गया!",
        "quoteExportFailed": "कोटेशन पीडीएफ निर्यात करने में विफल"
    },
    "gu": {
        "exportQuote": "કોટેશન નિકાસ કરો",
        "quoteExportSuccess": "કોટેશન પીડીએફ સફળતાપૂર્વક નિકાસ કરવામાં આવી!",
        "quoteExportFailed": "કોટેશન પીડીએફ નિકાસ કરવામાં નિષ્ફળ"
    },
    "es": {
        "exportQuote": "Exportar cotización",
        "quoteExportSuccess": "¡Cotización PDF exportada con éxito!",
        "quoteExportFailed": "Error al exportar el PDF de cotización"
    },
    "fr": {
        "exportQuote": "Exporter le devis",
        "quoteExportSuccess": "Devis PDF exporté avec succès !",
        "quoteExportFailed": "Échec de l'exportation du devis PDF"
    },
    "de": {
        "exportQuote": "Angebot exportieren",
        "quoteExportSuccess": "Angebots-PDF erfolgreich exportiert!",
        "quoteExportFailed": "Angebots-PDF konnte nicht exportiert werden"
    },
    "ar": {
        "exportQuote": "تصدير العرض",
        "quoteExportSuccess": "تم تصدير عرض السعر PDF بنجاح!",
        "quoteExportFailed": "فشل تصدير عرض السعر PDF"
    }
}

for lang, keys in translations.items():
    file_path = os.path.join(locales_dir, lang, "translation.json")
    if os.path.exists(file_path):
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        
        # Inject into 'bids'
        if "bids" in data:
            for k, v in keys.items():
                data["bids"][k] = v
        
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"Updated bids translations for {lang}")
    else:
        print(f"File not found: {file_path}")
