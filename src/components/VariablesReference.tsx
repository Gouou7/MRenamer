import { useTranslation } from "react-i18next";
import { variableCategories, useVariables } from "@/lib/variables";

export function VariablesReference() {
  const { t } = useTranslation();
  const variables = useVariables();
  return (
    <section
      className="variables-reference"
      aria-labelledby="variables-heading"
    >
      <h3 id="variables-heading" className="settings-heading">
        {t("availableVariables")}
      </h3>
      <p className="help-text">{t("variablesHelp")}</p>
      {variableCategories.map((category) => (
        <section key={category} aria-labelledby={`variables-${category}`}>
          <h4 id={`variables-${category}`}>
            {t(`variableCategories.${category}`)}
          </h4>
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
