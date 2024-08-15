import { SavedGroupInterface } from "back-end/types/saved-group";
import { useMemo, useState } from "react";
import { ago } from "shared/dates";
import { getMatchingRules } from "shared/util";
import { useAuth } from "@front-end/services/auth";
import { useEnvironments, useFeaturesList } from "@front-end/services/features";
import { useSearch } from "@front-end/services/search";
import { getSavedGroupMessage } from "@front-end/pages/saved-groups";
import LoadingOverlay from "@front-end/components/LoadingOverlay";
import Button from "@front-end/components/Button";
import { GBAddCircle } from "@front-end/components/Icons";
import Field from "@front-end/components/Forms/Field";
import MoreMenu from "@front-end/components/Dropdown/MoreMenu";
import DeleteButton from "@front-end/components/DeleteButton/DeleteButton";
import { MultiValuesDisplay } from "@front-end/components/Features/ConditionDisplay";
import usePermissionsUtil from "@front-end/hooks/usePermissionsUtils";
import SavedGroupForm from "./SavedGroupForm";

export interface Props {
  groups: SavedGroupInterface[];
  mutate: () => void;
}

export default function IdLists({ groups, mutate }: Props) {
  const [
    savedGroupForm,
    setSavedGroupForm,
  ] = useState<null | Partial<SavedGroupInterface>>(null);
  const permissionsUtil = usePermissionsUtil();
  const canCreate = permissionsUtil.canCreateSavedGroup();
  const canUpdate = permissionsUtil.canUpdateSavedGroup();
  const canDelete = permissionsUtil.canDeleteSavedGroup();
  const { apiCall } = useAuth();

  const idLists = useMemo(() => {
    return groups.filter((g) => g.type === "list");
  }, [groups]);

  const { features } = useFeaturesList();

  const environments = useEnvironments();

  // Get a list of feature ids for every saved group
  // TODO: also get experiments
  const savedGroupFeatureIds = useMemo(() => {
    const map: Record<string, Set<string>> = {};

    features.forEach((feature) => {
      idLists.forEach((group) => {
        const matches = getMatchingRules(
          feature,
          (rule) =>
            rule.condition?.includes(group.id) ||
            rule.savedGroups?.some((g) => g.ids.includes(group.id)) ||
            false,
          environments.map((e) => e.id)
        );

        if (matches.length > 0) {
          map[group.id] = map[group.id] || new Set();
          map[group.id].add(feature.id);
        }
      });
    });
    return map;
  }, [idLists, environments, features]);

  const { items, searchInputProps, isFiltered, SortableTH } = useSearch({
    items: idLists,
    localStorageKey: "savedGroups",
    defaultSortField: "dateCreated",
    defaultSortDir: -1,
    searchFields: ["groupName^3", "attributeKey^2", "owner", "values"],
  });

  if (!idLists) return <LoadingOverlay />;

  return (
    <div className="mb-5 appbox p-3 bg-white">
      {savedGroupForm && (
        <SavedGroupForm
          close={() => setSavedGroupForm(null)}
          current={savedGroupForm}
          type="list"
        />
      )}
      <div className="row align-items-center mb-1">
        <div className="col-auto">
          <h2 className="mb-0">ID Lists</h2>
        </div>
        <div className="flex-1"></div>
        {canCreate ? (
          <div className="col-auto">
            <Button
              color="primary"
              onClick={async () => {
                setSavedGroupForm({});
              }}
            >
              <GBAddCircle /> Add ID List
            </Button>
          </div>
        ) : null}
      </div>
      <p className="text-gray mb-1">
        With <strong>ID Lists</strong>, you pick an attribute and add a list of
        included values directly within the GrowthBook UI.
      </p>
      <p className="text-gray">
        For example, a &quot;Beta Testers&quot; group containing a specific set
        of <code>device_id</code> values.
      </p>
      {idLists.length > 0 && (
        <>
          <div className="row mb-2 align-items-center">
            <div className="col-auto">
              <Field
                placeholder="Search..."
                type="search"
                {...searchInputProps}
              />
            </div>
          </div>
          <div className="row mb-0">
            <div className="col-12">
              <table className="table appbox gbtable">
                <thead>
                  <tr>
                    <SortableTH field={"groupName"}>Name</SortableTH>
                    <SortableTH field="attributeKey">Attribute</SortableTH>
                    <th>Values</th>
                    <SortableTH field={"owner"}>Owner</SortableTH>
                    <SortableTH field={"dateUpdated"}>Date Updated</SortableTH>
                    {(canUpdate || canDelete) && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {items.map((s) => {
                    return (
                      <tr key={s.id}>
                        <td>{s.groupName}</td>
                        <td>{s.attributeKey}</td>
                        <td>
                          <div className="d-flex flex-wrap">
                            <MultiValuesDisplay values={s.values || []} />
                          </div>
                        </td>
                        <td>{s.owner}</td>
                        <td>{ago(s.dateUpdated)}</td>
                        {canUpdate || canDelete ? (
                          <td style={{ width: 30 }}>
                            <MoreMenu>
                              {canUpdate ? (
                                <a
                                  href="#"
                                  className="dropdown-item"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    setSavedGroupForm(s);
                                  }}
                                >
                                  Edit
                                </a>
                              ) : null}
                              {canDelete ? (
                                <DeleteButton
                                  displayName="Saved Group"
                                  className="dropdown-item text-danger"
                                  useIcon={false}
                                  text="Delete"
                                  title="Delete SavedGroup"
                                  onClick={async () => {
                                    await apiCall(`/saved-groups/${s.id}`, {
                                      method: "DELETE",
                                    });
                                    mutate();
                                  }}
                                  getConfirmationContent={getSavedGroupMessage(
                                    savedGroupFeatureIds[s.id]
                                  )}
                                  canDelete={
                                    (savedGroupFeatureIds[s.id]?.size || 0) ===
                                    0
                                  }
                                />
                              ) : null}
                            </MoreMenu>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                  {!items.length && isFiltered && (
                    <tr>
                      <td
                        colSpan={canUpdate || canDelete ? 6 : 5}
                        align={"center"}
                      >
                        No matching saved groups
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
