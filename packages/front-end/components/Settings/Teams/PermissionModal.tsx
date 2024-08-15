import { MemberRoleWithProjects } from "back-end/types/organization";
import { useForm } from "react-hook-form";
import Modal from "@front-end/components/Modal";
import { useAuth } from "@front-end/services/auth";
import { Team } from "@front-end/services/UserContext";
import RoleSelector from "@front-end/components/Settings/Team/RoleSelector";

export const PermissionsModal = ({
  team,
  open,
  onClose,
  onSuccess,
}: {
  team: Team;
  open: boolean;
  onClose: () => void;
  onSuccess: () => Promise<unknown>;
}) => {
  const form = useForm<{
    roleInfo: MemberRoleWithProjects;
  }>({
    defaultValues: {
      roleInfo: {
        role: team.role,
        limitAccessByEnvironment: team.limitAccessByEnvironment,
        environments: team.environments,
        projectRoles: team.projectRoles || [],
      },
    },
  });
  const { apiCall } = useAuth();

  return (
    <Modal
      open={open}
      close={() => onClose()}
      header={"Edit Team Permissions"}
      submit={form.handleSubmit(async (value) => {
        await apiCall(`/teams/${team.id}`, {
          method: "PUT",
          body: JSON.stringify({
            permissions: { ...value.roleInfo },
          }),
        });
        await onSuccess();
      })}
    >
      <RoleSelector
        value={form.watch("roleInfo")}
        setValue={(value) => form.setValue("roleInfo", value)}
      />
    </Modal>
  );
};
