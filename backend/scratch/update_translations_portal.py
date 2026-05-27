import os
import json

locales_dir = r"c:\Users\shiva\Desktop\sem6\bidflow\frontend\src\locales"

translations = {
    "en": {
        "common": {
            "portalTitle": "Customer Portal",
            "portalSubtitle": "Track your bid progress and view documents",
            "linkExpired": "This link is expired or invalid.",
            "timeline": "Status Timeline",
            "documents": "Documents"
        },
        "enquiries": {
            "share": "Share",
            "shareSuccess": "Public link copied to clipboard!",
            "shareFailed": "Failed to generate share link"
        }
    },
    "hi": {
        "common": {
            "portalTitle": "ग्राहक पोर्टल",
            "portalSubtitle": "अपनी बोली की प्रगति ट्रैक करें और दस्तावेज़ देखें",
            "linkExpired": "यह लिंक समाप्त या अमान्य हो गया है।",
            "timeline": "स्थिति समयरेखा",
            "documents": "दस्तावेज़"
        },
        "enquiries": {
            "share": "साझा करें",
            "shareSuccess": "सार्वजनिक लिंक क्लिपबोर्ड पर कॉपी किया गया!",
            "shareFailed": "साझा लिंक उत्पन्न करने में विफल"
        }
    },
    "gu": {
        "common": {
            "portalTitle": "ગ્રાહક પોર્ટલ",
            "portalSubtitle": "તમારી બોલીની પ્રગતિ ટ્રૅક કરો અને દસ્તાવેજો જુઓ",
            "linkExpired": "આ લિંક સમાપ્ત અથવા અમાન્ય છે.",
            "timeline": "સ્થિતિ સમયરેખા",
            "documents": "દસ્તાવેજો"
        },
        "enquiries": {
            "share": "શેર કરો",
            "shareSuccess": "પબ્લિક લિંક ક્લિપબોર્ડ પર કોપી થઈ!",
            "shareFailed": "શેર લિંક બનાવવામાં નિષ્ફળ"
        }
    },
    "es": {
        "common": {
            "portalTitle": "Portal del Cliente",
            "portalSubtitle": "Realice el seguimiento de su propuesta y acceda a documentos",
            "linkExpired": "Este enlace ha caducado o no es válido.",
            "timeline": "Línea de tiempo de estado",
            "documents": "Documentos"
        },
        "enquiries": {
            "share": "Compartir",
            "shareSuccess": "¡Enlace público copiado al portapapeles!",
            "shareFailed": "Error al generar el enlace de compartir"
        }
    },
    "fr": {
        "common": {
            "portalTitle": "Portail Client",
            "portalSubtitle": "Suivez l'avancement de votre offre et accédez aux documents",
            "linkExpired": "Ce lien a expiré ou est invalide.",
            "timeline": "Historique des statuts",
            "documents": "Documents"
        },
        "enquiries": {
            "share": "Partager",
            "shareSuccess": "Lien public copié dans le presse-papiers !",
            "shareFailed": "Échec de la génération du lien de partage"
        }
    },
    "de": {
        "common": {
            "portalTitle": "Kundenportal",
            "portalSubtitle": "Verfolgen Sie Ihren Angebotsstatus und greifen Sie auf Dokumente zu",
            "linkExpired": "Dieser Link ist abgelaufen oder ungültig.",
            "timeline": "Status-Verlauf",
            "documents": "Dokumente"
        },
        "enquiries": {
            "share": "Teilen",
            "shareSuccess": "Öffentlicher Link in die Zwischenablage kopiert!",
            "shareFailed": "Teilungslink konnte nicht generiert werden"
        }
    },
    "ar": {
        "common": {
            "portalTitle": "بوابة العملاء",
            "portalSubtitle": "تتبع حالة العرض الخاص بك والوصول إلى المستندات",
            "linkExpired": "هذا الرابط منتهي الصلاحية أو غير صالح.",
            "timeline": "الخط الزمني للحالة",
            "documents": "المستندات"
        },
        "enquiries": {
            "share": "مشاركة",
            "shareSuccess": "تم نسخ الرابط العام إلى الحافظة!",
            "shareFailed": "فشل إنشاء رابط المشاركة"
        }
    }
}

for lang, sections in translations.items():
    file_path = os.path.join(locales_dir, lang, "translation.json")
    if os.path.exists(file_path):
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        
        # Inject into 'common'
        if "common" in data:
            for k, v in sections["common"].items():
                data["common"][k] = v
        # Inject into 'enquiries'
        if "enquiries" in data:
            for k, v in sections["enquiries"].items():
                data["enquiries"][k] = v
        
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"Updated portal translations for {lang}")
    else:
        print(f"File not found: {file_path}")
