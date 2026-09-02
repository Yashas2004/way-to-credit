import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdminUserView } from "@way-to-credit/shared";
import { useState } from "react";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { Input } from "../../components/Input";
import { Modal } from "../../components/Modal";
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
  fetchUsers,
  reactivateUser,
  resetUserPassword,
} from "../../lib/adminApi";
import { formatIstDateTime } from "../../lib/format";
import { CreditAdjustmentModal } from "./CreditAdjustmentModal";

export function UsersPage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const usersQuery = useQuery({ queryKey: ["admin", "users"], queryFn: fetchUsers });

  const [createOpen, setCreateOpen] = useState(false);
  const [resetPasswordUser, setResetPasswordUser] = useState<AdminUserView | null>(null);
  const [deactivateUserRow, setDeactivateUserRow] = useState<AdminUserView | null>(null);
  const [creditAdjustUser, setCreditAdjustUser] = useState<AdminUserView | null>(null);
  const [pendingReactivateId, setPendingReactivateId] = useState<string | null>(null);

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

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-h1 text-ink">Users</h1>
          <p className="mt-1 text-body text-slate">Create, credit, and manage user accounts.</p>
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
          <EmptyState
            title="No users yet"
            description="Create the first user account to get started."
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
                      label={user.isActive ? "Active" : "Deactivated"}
                    />
                  </TableCell>
                  <TableCell className="text-small text-slate">
                    {user.lastSeenAt ? `${formatIstDateTime(user.lastSeenAt)} IST` : "Never"}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setCreditAdjustUser(user);
                        }}
                      >
                        Adjust credits
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setResetPasswordUser(user);
                        }}
                      >
                        Reset password
                      </Button>
                      {user.isActive ? (
                        <Button
                          variant="ghost"
                          className="text-alert"
                          onClick={() => {
                            setDeactivateUserRow(user);
                          }}
                        >
                          Deactivate
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          loading={pendingReactivateId === user.id}
                          onClick={() => void handleReactivate(user.id)}
                        >
                          Reactivate
                        </Button>
                      )}
                    </div>
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

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Create user">
      <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
        <Input
          label="User ID"
          value={userId}
          onChange={(e) => {
            setUserId(e.target.value);
          }}
          placeholder="e.g. jdoe"
          disabled={submitting}
        />
        <Input
          label="Display name"
          value={displayName}
          onChange={(e) => {
            setDisplayName(e.target.value);
          }}
          disabled={submitting}
        />
        <Input
          label="Temporary password"
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
          }}
          hint="At least 8 characters."
          disabled={submitting}
        />

        {error && (
          <p role="alert" className="text-small text-alert">
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
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
          }}
          hint="At least 8 characters."
          disabled={submitting}
        />

        {error && (
          <p role="alert" className="text-small text-alert">
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
