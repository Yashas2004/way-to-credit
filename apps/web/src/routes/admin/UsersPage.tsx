import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdminUserView, ListUsersQuery } from "@way-to-credit/shared";
import { useState } from "react";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { Input } from "../../components/Input";
import { Modal } from "../../components/Modal";
import { Select } from "../../components/Select";
import { Spinner } from "../../components/Spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "../../components/Table";
import { useToast } from "../../components/Toast";
import { ApiError } from "../../lib/api";
import {
  createUser,
  deactivateUser,
  archiveUser,
  fetchUsers,
  reactivateUser,
  unarchiveUser,
  resetUserPassword,
} from "../../lib/adminApi";
import { formatIstDateTime } from "../../lib/format";
import { CreditAdjustmentModal } from "./CreditAdjustmentModal";

export function UsersPage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  // Archived users ("have left") are hidden unless asked for.
  const [show, setShow] = useState<ListUsersQuery["archived"]>("exclude");
  const usersQuery = useQuery({
    queryKey: ["admin", "users", show],
    queryFn: () => fetchUsers(show),
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [resetPasswordUser, setResetPasswordUser] = useState<AdminUserView | null>(null);
  const [deactivateUserRow, setDeactivateUserRow] = useState<AdminUserView | null>(null);
  const [creditAdjustUser, setCreditAdjustUser] = useState<AdminUserView | null>(null);
  const [pendingReactivateId, setPendingReactivateId] = useState<string | null>(null);
  const [archiveUserRow, setArchiveUserRow] = useState<AdminUserView | null>(null);
  const [pendingUnarchiveId, setPendingUnarchiveId] = useState<string | null>(null);

  function invalidateUsers() {
    return queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
  }

  async function handleReactivate(id: string) {
    setPendingReactivateId(id);
    try {
      await reactivateUser(id);
      await invalidateUsers();
      showToast("User reactivated.", "success");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Couldn't reactivate this user.", "error");
    } finally {
      setPendingReactivateId(null);
    }
  }

  async function handleUnarchive(user: AdminUserView) {
    setPendingUnarchiveId(user.id);
    try {
      await unarchiveUser(user.id);
      await invalidateUsers();
      showToast(
        `${user.displayName} is unarchived. They're still deactivated: reactivate them to restore access.`,
        "success",
      );
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Couldn't unarchive this user.", "error");
    } finally {
      setPendingUnarchiveId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-h1 text-ink">Users</h1>
          <p className="mt-1 text-body text-muted">Create, credit, and manage user accounts.</p>
        </div>
        <Button
          variant="primary"
          onClick={() => {
            setCreateOpen(true);
          }}
        >
          Create user
        </Button>
      </div>

      <div className="max-w-xs">
        <Select
          label="Show"
          value={show}
          onChange={(e) => {
            setShow(e.target.value as ListUsersQuery["archived"]);
          }}
          options={[
            { value: "exclude", label: "Current users" },
            { value: "include", label: "Current and archived" },
            { value: "only", label: "Archived only" },
          ]}
        />
      </div>

      {usersQuery.isPending && (
        <div className="flex justify-center py-12">
          <Spinner size="lg" label="Loading users" />
        </div>
      )}

      {usersQuery.isError && (
        <ErrorState
          message="We couldn't load users. Check your connection and try again."
          action={
            <Button variant="secondary" onClick={() => void usersQuery.refetch()}>
              Retry
            </Button>
          }
        />
      )}

      {usersQuery.data &&
        (usersQuery.data.length === 0 ? (
          show === "only" ? (
            <EmptyState
              title="No archived users"
              description="Users you archive appear here. Archiving keeps all their history."
            />
          ) : (
            <EmptyState
              title="No users to show"
              description={
                show === "exclude"
                  ? "Create a user to get started. Archived users are hidden: choose “Current and archived” under Show to see them."
                  : "Create the first user account to get started."
              }
              action={
                <Button
                  variant="primary"
                  onClick={() => {
                    setCreateOpen(true);
                  }}
                >
                  Create user
                </Button>
              }
            />
          )
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>User ID</TableHeaderCell>
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell>Credits</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Last seen</TableHeaderCell>
                <TableHeaderCell>Actions</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {usersQuery.data.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-mono">{user.userId}</TableCell>
                  <TableCell>{user.displayName}</TableCell>
                  <TableCell className="tabular-nums">{user.creditPoints}</TableCell>
                  <TableCell>
                    <Badge
                      tone={user.isActive ? "success" : "neutral"}
                      label={
                        user.archivedAt ? "Archived" : user.isActive ? "Active" : "Deactivated"
                      }
                    />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-small text-muted">
                    {user.lastSeenAt ? `${formatIstDateTime(user.lastSeenAt)} IST` : "Never"}
                  </TableCell>
                  <TableCell>
                    {user.archivedAt ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        loading={pendingUnarchiveId === user.id}
                        onClick={() => void handleUnarchive(user)}
                      >
                        Unarchive
                      </Button>
                    ) : (
                      <div className="flex items-center gap-1.5 whitespace-nowrap">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setCreditAdjustUser(user);
                          }}
                        >
                          Adjust credits
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setResetPasswordUser(user);
                          }}
                        >
                          Reset password
                        </Button>
                        {user.isActive ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-negative"
                            onClick={() => {
                              setDeactivateUserRow(user);
                            }}
                          >
                            Deactivate
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            loading={pendingReactivateId === user.id}
                            onClick={() => void handleReactivate(user.id)}
                          >
                            Reactivate
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setArchiveUserRow(user);
                          }}
                        >
                          Archive
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ))}

      <CreateUserModal
        isOpen={createOpen}
        onClose={() => {
          setCreateOpen(false);
        }}
      />

      {resetPasswordUser && (
        <ResetPasswordModal
          isOpen
          user={resetPasswordUser}
          onClose={() => {
            setResetPasswordUser(null);
          }}
        />
      )}

      {creditAdjustUser && (
        <CreditAdjustmentModal
          isOpen
          userId={creditAdjustUser.id}
          displayName={creditAdjustUser.displayName}
          onClose={() => {
            setCreditAdjustUser(null);
          }}
        />
      )}

      <ConfirmDialog
        isOpen={archiveUserRow !== null}
        onClose={() => {
          setArchiveUserRow(null);
        }}
        title="Archive user"
        description={
          archiveUserRow
            ? `Archive ${archiveUserRow.displayName}? They'll be signed out and can't sign in. Their queries, credits and history stay exactly as they are. You can unarchive them later; they come back deactivated, and you can reactivate them separately.`
            : ""
        }
        confirmLabel="Archive"
        onConfirm={async () => {
          if (!archiveUserRow) return;
          try {
            await archiveUser(archiveUserRow.id);
            await invalidateUsers();
            showToast(`${archiveUserRow.displayName} archived.`, "success");
          } catch (err) {
            showToast(
              err instanceof ApiError ? err.message : "Couldn't archive this user.",
              "error",
            );
          }
          setArchiveUserRow(null);
        }}
      />

      <ConfirmDialog
        isOpen={deactivateUserRow !== null}
        onClose={() => {
          setDeactivateUserRow(null);
        }}
        title="Deactivate user"
        description={
          deactivateUserRow
            ? `This logs ${deactivateUserRow.displayName} out immediately and blocks further sign-ins until reactivated.`
            : ""
        }
        confirmLabel="Deactivate"
        onConfirm={async () => {
          if (!deactivateUserRow) return;
          try {
            await deactivateUser(deactivateUserRow.id);
            await invalidateUsers();
            showToast("User deactivated.", "success");
            setDeactivateUserRow(null);
          } catch (err) {
            showToast(
              err instanceof ApiError ? err.message : "Couldn't deactivate this user.",
              "error",
            );
          }
        }}
      />
    </div>
  );
}

function CreateUserModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleClose() {
    if (submitting) return;
    setUserId("");
    setDisplayName("");
    setPassword("");
    setError(null);
    onClose();
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await createUser({ userId: userId.trim(), displayName: displayName.trim(), password });
      await queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      showToast("User created.", "success");
      handleClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const valid = userId.trim().length > 0 && displayName.trim().length > 0 && password.length >= 8;

  // The state above always starts empty — the "pre-filled" values admins
  // saw were the browser autofilling the *admin's own* saved login into an
  // unannotated username + password pair. autoComplete tells it this is a
  // new account, not a sign-in (Chrome ignores "off" on password fields but
  // honours "new-password").
  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Create user">
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="flex flex-col gap-4"
        autoComplete="off"
      >
        <Input
          label="User ID"
          value={userId}
          onChange={(e) => {
            setUserId(e.target.value);
          }}
          placeholder="e.g. jdoe"
          autoComplete="off"
          disabled={submitting}
        />
        <Input
          label="Display name"
          value={displayName}
          onChange={(e) => {
            setDisplayName(e.target.value);
          }}
          placeholder="e.g. Jane Doe"
          autoComplete="off"
          disabled={submitting}
        />
        <Input
          label="Temporary password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
          }}
          hint="At least 8 characters."
          disabled={submitting}
        />

        {error && (
          <p role="alert" className="text-small text-negative">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={submitting} disabled={!valid}>
            Create
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ResetPasswordModal({
  isOpen,
  user,
  onClose,
}: {
  isOpen: boolean;
  user: AdminUserView;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleClose() {
    if (submitting) return;
    setPassword("");
    setError(null);
    onClose();
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting || password.length < 8) return;
    setSubmitting(true);
    setError(null);
    try {
      await resetUserPassword(user.id, password);
      showToast(`Password reset for ${user.displayName}.`, "success");
      handleClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={`Reset password — ${user.displayName}`}>
      <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
        <Input
          label="New password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
          }}
          hint="At least 8 characters."
          disabled={submitting}
        />

        {error && (
          <p role="alert" className="text-small text-negative">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={submitting}
            disabled={password.length < 8}
          >
            Reset password
          </Button>
        </div>
      </form>
    </Modal>
  );
}
