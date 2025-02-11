import { useForm } from "react-hook-form";
import {
  FeatureEnvironment,
  FeatureInterface,
  FeatureValueType,
} from "back-end/types/feature";
import dJSON from "dirty-json";
import React, { ReactElement, useState } from "react";
import {
  getJSONValidator,
  inferSimpleSchemaFromValue,
  simpleToJSONSchema,
  validateFeatureValue,
} from "shared/util";
import { Box, Heading, Text } from "@radix-ui/themes";
import { EditSimpleSchema } from "@/components/Features/EditSchemaModal";
import { useAuth } from "@/services/auth";
import Modal from "@/components/Modal";
import { useDefinitions } from "@/services/DefinitionsContext";
import track from "@/services/track";
import {
  genDuplicatedKey,
  getDefaultValue,
  useEnvironments,
} from "@/services/features";
import Tooltip from "@/components/Tooltip/Tooltip";
import { useWatching } from "@/services/WatchProvider";
import MarkdownInput from "@/components/Markdown/MarkdownInput";
import { useDemoDataSourceProject } from "@/hooks/useDemoDataSourceProject";
import CustomFieldInput from "@/components/CustomFields/CustomFieldInput";
import {
  filterCustomFieldsForSectionAndProject,
  useCustomFields,
} from "@/hooks/useCustomFields";
import { useUser } from "@/services/UserContext";
import FeatureValueField from "@/components/Features/FeatureValueField";
import usePermissionsUtil from "@/hooks/usePermissionsUtils";
import useProjectOptions from "@/hooks/useProjectOptions";
import SelectField from "@/components/Forms/SelectField";
import Frame from "@/components/Radix/Frame";
import PaidFeatureBadge from "@/components/GetStarted/PaidFeatureBadge";
import FeatureKeyField from "./FeatureKeyField";
import EnvironmentSelect from "./EnvironmentSelect";
import TagsField from "./TagsField";
import ValueTypeField from "./ValueTypeField";

export type Props = {
  close?: () => void;
  onSuccess: (feature: FeatureInterface) => Promise<void>;
  inline?: boolean;
  cta?: string;
  secondaryCTA?: ReactElement;
  featureToDuplicate?: FeatureInterface;
  features?: FeatureInterface[];
};

function parseDefaultValue(
  defaultValue: string,
  valueType: FeatureValueType
): string {
  if (valueType === "boolean") {
    return defaultValue === "true" ? "true" : "false";
  }
  if (valueType === "number") {
    return parseFloat(defaultValue) + "";
  }
  if (valueType === "string") {
    return defaultValue;
  }
  try {
    return JSON.stringify(dJSON.parse(defaultValue), null, 2);
  } catch (e) {
    throw new Error(`JSON parse error for default value`);
  }
}

const genEnvironmentSettings = ({
  environments,
  featureToDuplicate,
  permissions,
  project,
}: {
  environments: ReturnType<typeof useEnvironments>;
  featureToDuplicate?: FeatureInterface;
  permissions: ReturnType<typeof usePermissionsUtil>;
  project: string;
}): Record<string, FeatureEnvironment> => {
  const envSettings: Record<string, FeatureEnvironment> = {};

  environments.forEach((e) => {
    const canPublish = permissions.canPublishFeature({ project }, [e.id]);
    const defaultEnabled = canPublish ? e.defaultState ?? true : false;
    const enabled = canPublish
      ? featureToDuplicate?.environmentSettings?.[e.id]?.enabled ??
        defaultEnabled
      : false;
    const rules = featureToDuplicate?.environmentSettings?.[e.id]?.rules ?? [];

    envSettings[e.id] = { enabled, rules };
  });

  return envSettings;
};

const genFormDefaultValues = ({
  environments,
  permissions: permissionsUtil,
  featureToDuplicate,
  project,
  customFields,
}: {
  environments: ReturnType<typeof useEnvironments>;
  permissions: ReturnType<typeof usePermissionsUtil>;
  featureToDuplicate?: FeatureInterface;
  project: string;
  customFields?: ReturnType<typeof useCustomFields>;
}): Pick<
  FeatureInterface,
  | "valueType"
  | "defaultValue"
  | "description"
  | "tags"
  | "project"
  | "id"
  | "environmentSettings"
  | "customFields"
  | "jsonSchema"
> => {
  const environmentSettings = genEnvironmentSettings({
    environments,
    featureToDuplicate,
    permissions: permissionsUtil,
    project,
  });

  const customFieldValues = customFields
    ? Object.fromEntries(
        customFields.map((field) => [
          field.id,
          featureToDuplicate?.customFields?.[field.id] ?? field.defaultValue,
        ])
      )
    : {};

  return featureToDuplicate
    ? {
        valueType: featureToDuplicate.valueType,
        jsonSchema: featureToDuplicate.jsonSchema,
        defaultValue: featureToDuplicate.defaultValue,
        description: featureToDuplicate.description,
        id: genDuplicatedKey(featureToDuplicate),
        project: featureToDuplicate.project ?? project,
        tags: featureToDuplicate.tags,
        environmentSettings,
        customFields: customFieldValues,
      }
    : {
        valueType: "" as FeatureValueType,
        defaultValue: getDefaultValue("boolean"),
        description: "",
        id: "",
        project,
        tags: [],
        environmentSettings,
        customFields: customFieldValues,
      };
};

type ExtendedFeatureValueType = FeatureValueType | "custom";

export default function FeatureModal({
  close,
  onSuccess,
  inline,
  cta = "Create",
  secondaryCTA,
  featureToDuplicate,
}: Props) {
  const { project, refreshTags } = useDefinitions();
  const environments = useEnvironments();
  const permissionsUtil = usePermissionsUtil();
  const { refreshWatching } = useWatching();
  const { hasCommercialFeature } = useUser();
  const [useSchemaCreator, setUseSchemaCreator] = useState(false);
  const [simpleSchema, setSimpleSchema] = useState(
    inferSimpleSchemaFromValue("{}")
  );
  const hasJsonValidator = hasCommercialFeature("json-validation");

  const customFields = filterCustomFieldsForSectionAndProject(
    useCustomFields(),
    "feature",
    project
  );

  const defaultValues = genFormDefaultValues({
    environments,
    permissions: permissionsUtil,
    featureToDuplicate,
    project,
    customFields: hasCommercialFeature("custom-metadata")
      ? customFields
      : undefined,
  });

  const form = useForm({ defaultValues });
  const flagValueType = form.watch("valueType") as ExtendedFeatureValueType;

  const projectOptions = useProjectOptions(
    (project) =>
      permissionsUtil.canCreateFeature({ project }) &&
      permissionsUtil.canManageFeatureDrafts({ project }),
    project ? [project] : []
  );
  const selectedProject = form.watch("project");
  const { projectId: demoProjectId } = useDemoDataSourceProject();

  const [showTags, setShowTags] = useState(!!featureToDuplicate?.tags?.length);
  const [showDescription, setShowDescription] = useState(
    !!featureToDuplicate?.description?.length
  );

  const { apiCall } = useAuth();

  const valueType = form.watch("valueType") as FeatureValueType;
  const environmentSettings = form.watch("environmentSettings");

  const modalHeader = featureToDuplicate
    ? `Duplicate Feature (${featureToDuplicate.id})`
    : "Create Feature";

  let ctaEnabled = true;
  let disabledMessage: string | undefined;

  if (
    !permissionsUtil.canManageFeatureDrafts({
      project: featureToDuplicate?.project ?? project,
    })
  ) {
    ctaEnabled = false;
    disabledMessage =
      "You don't have permission to create feature flag drafts.";
  }

  // We want to show a warning when someone tries to create a feature under the demo project
  const { currentProjectIsDemo } = useDemoDataSourceProject();

  const usingJsonSchema =
    flagValueType === "custom" ||
    (flagValueType === "json" && useSchemaCreator);

  return (
    <Modal
      trackingEventModalType=""
      open
      size="lg"
      inline={inline}
      header={modalHeader}
      cta={cta}
      close={close}
      ctaEnabled={ctaEnabled}
      disabledMessage={disabledMessage}
      secondaryCTA={secondaryCTA}
      submit={form.handleSubmit(async (values) => {
        const { defaultValue, ...feature } = values;
        let valueType = feature.valueType as ExtendedFeatureValueType;

        if (!valueType) {
          throw new Error("Please select a value type");
        }

        const hasSchema =
          valueType === "custom" || (valueType === "json" && useSchemaCreator);
        // if custom type, set valueType to json - custom is not a supported value of FeatureValueType
        if (valueType === "custom") {
          valueType = "json";
          feature.valueType = "json";
        }

        if (hasSchema && hasJsonValidator) {
          const schemaString = simpleToJSONSchema(simpleSchema);
          try {
            const parsedSchema = JSON.parse(schemaString);
            const ajv = getJSONValidator();
            ajv.compile(parsedSchema);
          } catch (e) {
            throw new Error(
              `The Simple Schema is invalid. Please check it and try again. Validator error: "${e.message}"`
            );
          }
          // add JSON validation to feature
          feature.jsonSchema = {
            date: new Date(),
            schemaType: "simple",
            schema: schemaString,
            simple: simpleSchema,
            enabled: true,
          };
        }

        const passedFeature = feature as FeatureInterface;
        const newDefaultValue = validateFeatureValue(
          passedFeature,
          defaultValue,
          "Value"
        );
        let hasChanges = false;
        if (newDefaultValue !== defaultValue) {
          form.setValue("defaultValue", newDefaultValue);
          hasChanges = true;
        }

        if (hasChanges) {
          throw new Error(
            "We fixed some errors in the feature. If it looks correct, submit again."
          );
        }

        const body = {
          ...feature,
          defaultValue: parseDefaultValue(defaultValue, valueType),
        };

        const res = await apiCall<{ feature: FeatureInterface }>(`/feature`, {
          method: "POST",
          body: JSON.stringify(body),
        });

        track("Feature Created", {
          valueType: values.valueType,
          hasDescription: !!values.description?.length,
          initialRule: "none",
        });
        values.tags && refreshTags(values.tags);
        refreshWatching();

        await onSuccess(res.feature);
      })}
    >
      {currentProjectIsDemo && (
        <div className="alert alert-warning">
          You are creating a feature under the demo datasource project.
        </div>
      )}

      <FeatureKeyField keyField={form.register("id")} />

      {showTags ? (
        <TagsField
          value={form.watch("tags") || []}
          onChange={(tags) => form.setValue("tags", tags)}
        />
      ) : (
        <a
          href="#"
          className="badge badge-light badge-pill mr-3 mb-3"
          onClick={(e) => {
            e.preventDefault();
            setShowTags(true);
          }}
        >
          + tags
        </a>
      )}

      {showDescription ? (
        <div className="form-group">
          <label>Description</label>
          <MarkdownInput
            value={form.watch("description") || ""}
            setValue={(value) => form.setValue("description", value)}
            autofocus={!featureToDuplicate?.description?.length}
          />
        </div>
      ) : (
        <a
          href="#"
          className="badge badge-light badge-pill mb-3"
          onClick={(e) => {
            e.preventDefault();
            setShowDescription(true);
          }}
        >
          + description
        </a>
      )}

      <EnvironmentSelect
        environmentSettings={environmentSettings}
        environments={environments}
        setValue={(env, on) => {
          environmentSettings[env.id].enabled = on;
          form.setValue("environmentSettings", environmentSettings);
        }}
      />

      {!featureToDuplicate && (
        <>
          <ValueTypeField
            value={valueType}
            onChange={(val) => {
              const defaultValue = getDefaultValue(val);
              form.setValue("valueType", val);
              form.setValue("defaultValue", defaultValue);
            }}
            useCustom={true}
          />
          {flagValueType === "json" && (
            <Box
              style={{ position: "relative", top: "-15px", textAlign: "right" }}
            >
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setUseSchemaCreator(!useSchemaCreator);
                }}
              >
                <Text as="span" size="1">
                  {!useSchemaCreator || !hasJsonValidator
                    ? "Add validation"
                    : "Remove validation"}
                </Text>
                <PaidFeatureBadge commercialFeature={"json-validation"} />
              </a>
            </Box>
          )}
        </>
      )}
      {hasJsonValidator && usingJsonSchema && (
        <Box>
          <Heading as="h4" size="2">
            Describe the values allowed in this feature flag.{" "}
            <Tooltip
              body={`Custom feature flag types let you describe the values that are allowed to be passed to your code. Feature types of this type will use a JSON object with custom JSON validation. This can be edited at any time after creation.`}
            />
          </Heading>
          <Frame>
            <EditSimpleSchema
              schema={simpleSchema}
              setSchema={(v) => setSimpleSchema(v)}
            />
          </Frame>
        </Box>
      )}

      {/*
          We hide rule configuration when duplicating a feature since the
          decision of which rule to display (out of potentially many) in the
          modal is not deterministic.
      */}
      {!featureToDuplicate && valueType && (
        <FeatureValueField
          label={"Default Value when Enabled"}
          id="defaultValue"
          value={form.watch("defaultValue")}
          setValue={(v) => form.setValue("defaultValue", v)}
          valueType={
            (valueType as ExtendedFeatureValueType) === "custom"
              ? "json"
              : valueType
          }
          renderJSONInline={true}
          initialSimpleSchema={
            usingJsonSchema && hasJsonValidator ? simpleSchema : undefined
          }
          initialValidationEnabled={usingJsonSchema && hasJsonValidator}
        />
      )}
      {hasCommercialFeature("custom-metadata") &&
        customFields &&
        customFields?.length > 0 && (
          <div>
            <CustomFieldInput
              customFields={customFields}
              setCustomFields={(value) => {
                form.setValue("customFields", value);
              }}
              currentCustomFields={form.watch("customFields") || {}}
              section={"feature"}
            />
          </div>
        )}
      {!featureToDuplicate && valueType && (
        <div className="alert alert-info">
          After creating your feature, you will be able to add targeted rules
          such as <strong>A/B Tests</strong> and{" "}
          <strong>Percentage Rollouts</strong> to control exactly how it gets
          released to users.
        </div>
      )}
      {selectedProject === demoProjectId && (
        <div className="alert alert-warning">
          You are creating a feature under the demo datasource project.
        </div>
      )}
      <SelectField
        label={
          <>
            {" "}
            Projects{" "}
            <Tooltip
              body={
                "The dropdown below has been filtered to only include projects where you have permission to update Features"
              }
            />{" "}
          </>
        }
        value={selectedProject || ""}
        onChange={(v) => {
          form.setValue("project", v);
        }}
        initialOption="None"
        options={projectOptions}
      />
    </Modal>
  );
}
