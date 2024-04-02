import {
  CreateFactTableProps,
  FactTableInterface,
  UpdateFactTableProps,
} from "back-end/types/fact-table";
import { useForm } from "react-hook-form";
import { useRouter } from "next/router";
import { isProjectListValidForProject } from "shared/util";
import { useEffect, useState } from "react";
import { FaExternalLinkAlt } from "react-icons/fa";
import { ProjectInterface } from "@back-end/types/project";
import { useDefinitions } from "@/services/DefinitionsContext";
import { useAuth } from "@/services/auth";
import useOrgSettings from "@/hooks/useOrgSettings";
import { getInitialMetricQuery, validateSQL } from "@/services/datasources";
import track from "@/services/track";
import Modal from "@/components/Modal";
import Field from "@/components/Forms/Field";
import SelectField from "@/components/Forms/SelectField";
import { getNewExperimentDatasourceDefaults } from "@/components/Experiment/NewExperimentForm";
import MultiSelectField from "@/components/Forms/MultiSelectField";
import EditSqlModal from "@/components/SchemaBrowser/EditSqlModal";
import Code from "@/components/SyntaxHighlighting/Code";
import { usesEventName } from "@/components/Metrics/MetricForm";
import usePermissions from "@/hooks/usePermissions";

export interface Props {
  existing?: FactTableInterface;
  close: () => void;
}

export default function FactTableModal({ existing, close }: Props) {
  const {
    datasources,
    project,
    projects,
    getDatasourceById,
    mutateDefinitions,
  } = useDefinitions();
  const settings = useOrgSettings();
  const router = useRouter();
  const permissions = usePermissions();

  const [sqlOpen, setSqlOpen] = useState(false);
  const [datasourceProjects, setDatasourceProjects] = useState<
    ProjectInterface[]
  >([]);

  const [
    showAdditionalColumnMessage,
    setShowAdditionalColumnMessage,
  ] = useState(false);

  const { apiCall } = useAuth();

  const validDatasources = datasources
    .filter((d) => isProjectListValidForProject(d.projects, project))
    .filter((d) => d.properties?.queryLanguage === "sql");

  const form = useForm<CreateFactTableProps>({
    defaultValues: {
      datasource:
        existing?.datasource ||
        getNewExperimentDatasourceDefaults(datasources, settings, project)
          .datasource,
      description: existing?.description || "",
      name: existing?.name || "",
      sql: existing?.sql || "",
      userIdTypes: existing?.userIdTypes || [],
      tags: existing?.tags || [],
      eventName: existing?.eventName || "",
      projects: existing?.projects || [project],
    },
  });

  const selectedDataSource = getDatasourceById(form.watch("datasource"));

  useEffect(() => {
    if (!selectedDataSource || existing) return;

    if (!selectedDataSource.projects || !selectedDataSource.projects.length) {
      const filteredProjects = projects.filter((project) => {
        // return permissionsUtil.canViewCreateFactTableModal(project.id);
        return permissions.check("manageFactTables", project.id);
      });
      setDatasourceProjects(filteredProjects);
      form.setValue("projects", [project]);
    } else {
      const filteredProjects = projects.filter((project) =>
        selectedDataSource.projects?.includes(project.id)
      );
      setDatasourceProjects(filteredProjects);
      form.setValue(
        "projects",
        filteredProjects.map((project) => project.id)
      );
    }

    const [userIdTypes, sql] = getInitialMetricQuery(
      selectedDataSource,
      "binomial"
    );

    form.setValue("userIdTypes", userIdTypes);
    form.setValue("sql", sql);
    setShowAdditionalColumnMessage(true);
  }, [selectedDataSource, existing, projects, project, permissions, form]);

  const isNew = !existing;
  useEffect(() => {
    track(
      isNew ? "Viewed Create Fact Table Modal" : "Viewed Edit Fact Table Modal"
    );
  }, [isNew]);

  return (
    <>
      {sqlOpen && (
        <EditSqlModal
          close={() => setSqlOpen(false)}
          datasourceId={form.watch("datasource")}
          placeholder={
            "SELECT\n      user_id as user_id, timestamp as timestamp\nFROM\n      test"
          }
          requiredColumns={new Set(["timestamp", ...form.watch("userIdTypes")])}
          value={form.watch("sql")}
          save={async (sql) => {
            form.setValue("sql", sql);
          }}
          templateVariables={{
            eventName: form.watch("eventName") || "",
          }}
          setTemplateVariables={({ eventName }) => {
            form.setValue("eventName", eventName || "");
          }}
        />
      )}
      <Modal
        open={true}
        close={close}
        cta={"Save"}
        header={existing ? "Edit Fact Table" : "Create Fact Table"}
        submit={form.handleSubmit(async (value) => {
          if (!value.userIdTypes.length) {
            throw new Error("Must select at least one identifier type");
          }

          if (!value.sql) {
            throw new Error("Must add a SQL query");
          }

          validateSQL(value.sql, ["timestamp", ...value.userIdTypes]);

          // Default eventName to the metric name
          value.eventName = value.eventName || value.name;

          if (existing) {
            const data: UpdateFactTableProps = {
              description: value.description,
              name: value.name,
              sql: value.sql,
              userIdTypes: value.userIdTypes,
              eventName: value.eventName,
            };
            await apiCall(`/fact-tables/${existing.id}`, {
              method: "PUT",
              body: JSON.stringify(data),
            });
            track("Edit Fact Table");
            await mutateDefinitions();
          } else {
            value.columns = [];

            const { factTable, error } = await apiCall<{
              factTable: FactTableInterface;
              error?: string;
            }>(`/fact-tables`, {
              method: "POST",
              body: JSON.stringify(value),
            });

            if (error) {
              throw new Error(error);
            }
            track("Create Fact Table");

            await mutateDefinitions();
            router.push(`/fact-tables/${factTable.id}`);
          }
        })}
      >
        <Field label="Name" {...form.register("name")} required />

        {!existing && (
          <>
            <SelectField
              label="Data Source"
              value={form.watch("datasource")}
              onChange={(v) => {
                form.setValue("datasource", v);
              }}
              options={validDatasources.map((d) => {
                const defaultDatasource = d.id === settings.defaultDataSource;
                return {
                  value: d.id,
                  label: `${d.name}${
                    d.description ? ` — ${d.description}` : ""
                  } ${defaultDatasource ? " (default)" : ""}`,
                };
              })}
              className="portal-overflow-ellipsis"
              name="datasource"
              placeholder="Select..."
            />
            <MultiSelectField
              label="Projects"
              placeholder="All projects"
              value={form.watch("projects")}
              options={datasourceProjects.map((p) => ({
                value: p.id,
                label: p.name,
              }))}
              onChange={(v) => form.setValue("projects", v)}
              customClassName="label-overflow-ellipsis"
              helpText="Assign this Fact Table to specific projects"
            />
          </>
        )}

        {selectedDataSource && (
          <MultiSelectField
            value={form.watch("userIdTypes")}
            onChange={(types) => {
              form.setValue("userIdTypes", types);
            }}
            options={(selectedDataSource.settings.userIdTypes || []).map(
              ({ userIdType }) => ({
                value: userIdType,
                label: userIdType,
              })
            )}
            label="Identifier Types Supported"
          />
        )}

        {selectedDataSource && usesEventName(form.watch("sql")) && (
          <Field
            label="Event Name in Database"
            helpText="Available as a template variable in your SQL"
            placeholder={form.watch("name")}
            {...form.register("eventName")}
          />
        )}

        {selectedDataSource && (
          <div className="form-group">
            <label>Query</label>
            {showAdditionalColumnMessage && (
              <div className="alert alert-info">
                We auto-generated some basic SQL for you below. Add any
                additional columns that would be useful for building metrics.
              </div>
            )}
            {form.watch("sql") && (
              <Code language="sql" code={form.watch("sql")} expandable={true} />
            )}
            <div>
              <button
                className="btn btn-outline-primary"
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  if (!form.watch("eventName")) {
                    form.setValue("eventName", form.watch("name"));
                  }
                  track("Edit Fact Table SQL", {
                    type: selectedDataSource.settings.schemaFormat,
                  });
                  setSqlOpen(true);
                }}
              >
                {form.watch("sql") ? "Edit" : "Add"} SQL <FaExternalLinkAlt />
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
