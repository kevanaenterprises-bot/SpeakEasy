import { useState, useEffect } from "react";
import { useLanguageSettings, SUPPORTED_LANGUAGES } from "@/hooks/useLanguageSettings";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [translationSpeed, setTranslationSpeed] = useState("real-time");
  const [audioQuality, setAudioQuality] = useState("high");
  const [autoScroll, setAutoScroll] = useState(true);
  const [saveLogs, setSaveLogs] = useState(false);
  
  const { settings, updateLanguages } = useLanguageSettings();
  const [yourLanguage, setYourLanguage] = useState(settings.yourLanguage);
  const [partnerLanguage, setPartnerLanguage] = useState(settings.partnerLanguage);

  // Load current settings when modal opens
  useEffect(() => {
    if (isOpen) {
      setYourLanguage(settings.yourLanguage);
      setPartnerLanguage(settings.partnerLanguage);
    }
  }, [isOpen, settings]);

  const handleSave = () => {
    // Update language settings using the hook
    updateLanguages(yourLanguage, partnerLanguage);
    
    // Save other settings to localStorage
    localStorage.setItem('speakeasy-settings', JSON.stringify({
      translationSpeed,
      audioQuality,
      autoScroll,
      saveLogs,
      yourLanguage,
      partnerLanguage,
    }));
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-full max-w-md" data-testid="settings-modal">
        <DialogHeader>
          <DialogTitle data-testid="text-settings-title">Translation Settings</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div>
            <Label htmlFor="translation-speed" className="block text-sm font-medium text-foreground mb-2">
              Translation Speed
            </Label>
            <Select value={translationSpeed} onValueChange={setTranslationSpeed}>
              <SelectTrigger data-testid="select-translation-speed">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="real-time">Real-time (Recommended)</SelectItem>
                <SelectItem value="delayed">Delayed (Higher Accuracy)</SelectItem>
                <SelectItem value="manual">Manual Trigger</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <Label htmlFor="audio-quality" className="block text-sm font-medium text-foreground mb-2">
              Audio Quality
            </Label>
            <Select value={audioQuality} onValueChange={setAudioQuality}>
              <SelectTrigger data-testid="select-audio-quality">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="high">High (Recommended)</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low (Save Bandwidth)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <Label htmlFor="your-language" className="block text-sm font-medium text-foreground mb-2">
              Your Language
            </Label>
            <Select value={yourLanguage} onValueChange={setYourLanguage}>
              <SelectTrigger data-testid="select-your-language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <SelectItem key={lang.code} value={lang.code}>
                    {lang.flag} {lang.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <Label htmlFor="partner-language" className="block text-sm font-medium text-foreground mb-2">
              Partner's Language
            </Label>
            <Select value={partnerLanguage} onValueChange={setPartnerLanguage}>
              <SelectTrigger data-testid="select-partner-language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <SelectItem key={lang.code} value={lang.code}>
                    {lang.flag} {lang.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex items-center space-x-2">
            <Checkbox 
              id="auto-scroll" 
              checked={autoScroll} 
              onCheckedChange={(checked) => setAutoScroll(checked as boolean)}
              data-testid="checkbox-auto-scroll"
            />
            <Label htmlFor="auto-scroll" className="text-sm text-foreground">
              Auto-scroll translation text
            </Label>
          </div>
          
          <div className="flex items-center space-x-2">
            <Checkbox 
              id="save-logs" 
              checked={saveLogs} 
              onCheckedChange={(checked) => setSaveLogs(checked as boolean)}
              data-testid="checkbox-save-logs"
            />
            <Label htmlFor="save-logs" className="text-sm text-foreground">
              Save conversation logs
            </Label>
          </div>
        </div>
        
        <div className="flex justify-end space-x-3 mt-6">
          <Button variant="ghost" onClick={onClose} data-testid="button-cancel">
            Cancel
          </Button>
          <Button onClick={handleSave} data-testid="button-save">
            Save Settings
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
