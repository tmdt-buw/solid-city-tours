import { translate, type ToursLanguage } from "./i18n";

export type LanguageToggleProps = {
  language: ToursLanguage;
  onChange: (language: ToursLanguage) => void;
};

export default function LanguageToggle({ language, onChange }: LanguageToggleProps) {
  return (
    <label className="language-toggle">
      <span className="language-toggle__label">{translate(language, "language")}</span>
      <select
        className="language-toggle__select"
        aria-label={translate(language, "language")}
        value={language}
        onChange={(event) => onChange(event.target.value as ToursLanguage)}
      >
        <option value="en">{translate(language, "english")}</option>
        <option value="de">{translate(language, "german")}</option>
      </select>
    </label>
  );
}
