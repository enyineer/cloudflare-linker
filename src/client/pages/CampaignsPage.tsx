import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "wouter";
import type { CampaignDto } from "../../shared/contract.ts";
import { can } from "../../shared/roles.ts";
import { Button } from "../components/Button.tsx";
import { ConfirmDialog } from "../components/ConfirmDialog.tsx";
import { EmptyState } from "../components/EmptyState.tsx";
import { ErrorBanner, LoadingScreen } from "../components/Feedback.tsx";
import { Field } from "../components/Field.tsx";
import { Input, Textarea } from "../components/controls.tsx";
import { Modal } from "../components/Modal.tsx";
import { useToast } from "../components/Toast.tsx";
import { toFormErrors, toMessage, type FormErrors } from "../lib/errors.ts";
import { useMe } from "../lib/me.tsx";
import { useInvalidate } from "../lib/mutations.ts";
import { orpc } from "../orpc.ts";

const NO_ERRORS: FormErrors = { message: null, fields: {} };

export function CampaignsPage() {
  const me = useMe();
  const editable = can(me.role, "writeCampaigns");
  const campaigns = useQuery(orpc.campaigns.list.queryOptions());
  const invalidate = useInvalidate();
  const { notify } = useToast();

  const [editing, setEditing] = useState<CampaignDto | "new" | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const remove = useMutation(
    orpc.campaigns.delete.mutationOptions({
      onSuccess: async () => {
        await invalidate(orpc.campaigns.key(), orpc.links.key());
        notify("Campaign removed.");
        setConfirmId(null);
      },
      onError: (err) => notify(toMessage(err), "error"),
    }),
  );

  return (
    <div className="stack">
      <div className="page__header">
        <div>
          <h1 className="page__title">Campaigns</h1>
          <p className="page__subtitle">Group links and fill in tracking tags (UTMs) automatically.</p>
        </div>
        {editable && (
          <div className="page__actions">
            <Button variant="primary" onClick={() => setEditing("new")}>
              New campaign
            </Button>
          </div>
        )}
      </div>

      {campaigns.isPending ? (
        <LoadingScreen />
      ) : campaigns.isError ? (
        <ErrorBanner message={toMessage(campaigns.error)} />
      ) : campaigns.data.length === 0 ? (
        <div className="card card--pad">
          <EmptyState
            icon="🎯"
            title="No campaigns yet"
            text="Campaigns let you reuse the same tracking tags across several links."
            action={
              editable ? (
                <Button variant="primary" onClick={() => setEditing("new")}>
                  Create a campaign
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="card">
          <div className="rows">
            {campaigns.data.map((c) => (
              <div className="row" key={c.id}>
                <div className="row__main">
                  <Link href={`/campaigns/${c.id}`} className="row__link">
                    {c.name}
                  </Link>
                  <div className="row__sub">
                    <span className="mono">{c.slug}</span>
                    {c.utmSource && ` · source: ${c.utmSource}`}
                    {c.utmMedium && ` · medium: ${c.utmMedium}`}
                  </div>
                </div>
                {editable && (
                  <div className="row__actions">
                    <Button size="sm" onClick={() => setEditing(c)}>
                      Edit
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => setConfirmId(c.id)}>
                      Delete
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {editing && <CampaignModal campaign={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {confirmId !== null && (
        <ConfirmDialog
          title="Delete this campaign?"
          message="Links in this campaign are kept, but they will no longer be grouped or get its tracking tags."
          busy={remove.isPending}
          onConfirm={() => remove.mutate({ id: confirmId })}
          onCancel={() => setConfirmId(null)}
        />
      )}
    </div>
  );
}

function CampaignModal({ campaign, onClose }: { campaign: CampaignDto | null; onClose: () => void }) {
  const invalidate = useInvalidate();
  const { notify } = useToast();
  const [name, setName] = useState(campaign?.name ?? "");
  const [slug, setSlug] = useState(campaign?.slug ?? "");
  const [utmSource, setUtmSource] = useState(campaign?.utmSource ?? "");
  const [utmMedium, setUtmMedium] = useState(campaign?.utmMedium ?? "");
  const [notes, setNotes] = useState(campaign?.notes ?? "");
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);

  const onError = (err: unknown) => setErrors(toFormErrors(err));
  const onSuccess = async () => {
    await invalidate(orpc.campaigns.key());
    notify(campaign ? "Campaign saved." : "Campaign created.");
    onClose();
  };
  const create = useMutation(orpc.campaigns.create.mutationOptions({ onSuccess, onError }));
  const update = useMutation(orpc.campaigns.update.mutationOptions({ onSuccess, onError }));
  const busy = create.isPending || update.isPending;

  const submit = () => {
    const payload = { name, slug: slug || undefined, utmSource, utmMedium, notes };
    if (campaign) update.mutate({ id: campaign.id, ...payload });
    else create.mutate(payload);
  };

  return (
    <Modal
      title={campaign ? "Edit campaign" : "New campaign"}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={busy}>
            {busy ? "Saving..." : "Save"}
          </Button>
        </>
      }
    >
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {errors.message && <ErrorBanner message={errors.message} />}
        <Field label="Campaign name" htmlFor="name" error={errors.fields.name}>
          <Input id="name" value={name} invalid={Boolean(errors.fields.name)} autoFocus onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field
          label="Short label"
          htmlFor="slug"
          hint="Used in tracking tags. Leave blank to create one from the name."
          error={errors.fields.slug}
        >
          <Input id="slug" value={slug} invalid={Boolean(errors.fields.slug)} placeholder="spring-promo" onChange={(e) => setSlug(e.target.value)} />
        </Field>
        <Field label="Tracking source (utm_source)" htmlFor="utmSource" hint="Where the traffic comes from, e.g. newsletter.">
          <Input id="utmSource" value={utmSource} onChange={(e) => setUtmSource(e.target.value)} />
        </Field>
        <Field label="Tracking medium (utm_medium)" htmlFor="utmMedium" hint="How they arrive, e.g. email or social.">
          <Input id="utmMedium" value={utmMedium} onChange={(e) => setUtmMedium(e.target.value)} />
        </Field>
        <Field label="Notes" htmlFor="notes">
          <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
