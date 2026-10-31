import { useTranslation } from "react-i18next";
import { variableCategories, useVariables } from "@/lib/variables";

export function VariablesReference() {
  const { t } = useTranslation();
  const variables = useVariables();
  return (
    <section
      className="variables-reference"
      aria-label={t("availableVariables")}
    >
      <p className="help-text">{t("variablesHelp")}</p>
      {variableCategories.map((category) => (
        <section key={category} aria-labelledby={`variables-${category}`}>
          <h3 id={`variables-${category}`}>
            {t(`variableCategories.${category}`)}
          </h3>
          <dl className="variable-definitions">
            {variables
              .filter((variable) => variable.category === category)
              .map((variable) => (
                <div key={variable.name}>
                  <dt>
                    <code>{`<${variable.name}>`}</code> {t(variable.labelKey)}
                  </dt>
                  <dd>
                    {t(variable.descriptionKey)}{" "}
                    <span>
                      {t("variableExample", { example: variable.example })}
                    </span>
                  </dd>
                </div>
              ))}
          </dl>
        </section>
      ))}
    </section>
  );
}
