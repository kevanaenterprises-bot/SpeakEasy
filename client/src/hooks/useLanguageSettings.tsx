import { useState, useEffect } from "react";

export interface Language {
  code: string;
  name: string;
  flag: string;
  speechCode?: string; // For speech recognition
}

export const SUPPORTED_LANGUAGES: Language[] = [
  { code: "en", name: "English", flag: "🇺🇸", speechCode: "en-US" },
  { code: "vi", name: "Vietnamese", flag: "🇻🇳", speechCode: "vi-VN" },
  { code: "es", name: "Spanish", flag: "🇪🇸", speechCode: "es-ES" },
  { code: "fr", name: "French", flag: "🇫🇷", speechCode: "fr-FR" },
  { code: "de", name: "German", flag: "🇩🇪", speechCode: "de-DE" },
  { code: "it", name: "Italian", flag: "🇮🇹", speechCode: "it-IT" },
  { code: "pt", name: "Portuguese", flag: "🇧🇷", speechCode: "pt-BR" },
  { code: "ru", name: "Russian", flag: "🇷🇺", speechCode: "ru-RU" },
  { code: "ja", name: "Japanese", flag: "🇯🇵", speechCode: "ja-JP" },
  { code: "ko", name: "Korean", flag: "🇰🇷", speechCode: "ko-KR" },
  { code: "zh", name: "Chinese", flag: "🇨🇳", speechCode: "zh-CN" },
  { code: "ar", name: "Arabic", flag: "🇸🇦", speechCode: "ar-SA" },
  { code: "hi", name: "Hindi", flag: "🇮🇳", speechCode: "hi-IN" },
  { code: "th", name: "Thai", flag: "🇹🇭", speechCode: "th-TH" },
];

interface LanguageSettings {
  yourLanguage: string;
  partnerLanguage: string;
}

export const useLanguageSettings = () => {
  const [settings, setSettings] = useState<LanguageSettings>({
    yourLanguage: "en",
    partnerLanguage: "en",
  });

  // Load settings from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('speakeasy-settings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.yourLanguage && parsed.partnerLanguage) {
          setSettings({
            yourLanguage: parsed.yourLanguage,
            partnerLanguage: parsed.partnerLanguage,
          });
        }
      } catch (error) {
        console.error('Error loading language settings:', error);
      }
    }
  }, []);

  // Save settings to localStorage whenever they change
  useEffect(() => {
    const currentSettings = localStorage.getItem('speakeasy-settings');
    if (currentSettings) {
      try {
        const parsed = JSON.parse(currentSettings);
        const updated = {
          ...parsed,
          yourLanguage: settings.yourLanguage,
          partnerLanguage: settings.partnerLanguage,
        };
        localStorage.setItem('speakeasy-settings', JSON.stringify(updated));
      } catch (error) {
        localStorage.setItem('speakeasy-settings', JSON.stringify(settings));
      }
    } else {
      localStorage.setItem('speakeasy-settings', JSON.stringify(settings));
    }
  }, [settings]);

  const getLanguage = (code: string): Language => {
    return SUPPORTED_LANGUAGES.find(lang => lang.code === code) || SUPPORTED_LANGUAGES[0];
  };

  const updateLanguages = (yourLang: string, partnerLang: string) => {
    setSettings({ yourLanguage: yourLang, partnerLanguage: partnerLang });
  };

  const swapLanguages = () => {
    setSettings(prev => ({
      yourLanguage: prev.partnerLanguage,
      partnerLanguage: prev.yourLanguage,
    }));
  };

  return {
    settings,
    yourLanguage: getLanguage(settings.yourLanguage),
    partnerLanguage: getLanguage(settings.partnerLanguage),
    updateLanguages,
    swapLanguages,
    getSpeechCode: (code: string) => getLanguage(code).speechCode || code,
  };
};