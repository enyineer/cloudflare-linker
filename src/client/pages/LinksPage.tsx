import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "wouter";
import type { CampaignDto, DomainDto, LinkDto } from "../../shared/contract.ts";
import { can } from "../../shared/roles.ts";
import type { QueryParam, RedirectType } from "../../shared/types.ts";
import { asRedirectType } from "../lib/enums.ts";
import { Badge } from "../components/Badge.tsx";
import { Button } from "../components/Button.tsx";
import { ConfirmDialog } from "../components/ConfirmDialog.tsx";
import { EmptyState } from "../components/EmptyState.tsx";
import { ErrorBanner, LoadingScreen } from "../components/Feedback.tsx";
import { Field } from "../components/Field.tsx";
import { Input } from "../components/controls.tsx";
import { Modal } from "../components/Modal.tsx";
import { Select } from "../components/Select.tsx";
import { Switch } from "../components/Switch.tsx";
import { useToast } from "../components/Toast.tsx";
import { toFormErrors, toMessage, type FormErrors } from "../lib/errors.ts";
import { useMe } from "../lib/me.tsx";
import { useInvalidate } from "../lib/mutations.ts";
import { orpc } from "../orpc.ts";

const NO_ERRORS: FormErrors = { message: null, fields: {} };

const REDIRECT_OPTIONS: { value: RedirectType; label: string }[] = [
  { value: 301, label: "301: Permanent (recommended for most links)" },
  { value: 302, label: "302: Temporary (good while testing)" },
  { value: 307, label: "307: Temporary, keeps the request method" },
  { value: 308, label: "308: Permanent, keeps the request method" },
];

export function LinksPage() {
  const me = useMe();
  const editable = can(me.role, "writeLinks");
  const links = useQuery(orpc.links.list.queryOptions({ input: {} }));
  const domains = useQuery(orpc.domains.list.queryOptions());
  const campaigns = useQuery(orpc.campaigns.list.queryOptions());
  const invalidate = useInvalidate();
  const { notify } = useToast();

  const [editing, setEditing] = useState<LinkDto | "new" | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [domainFilter, setDomainFilter] = useState("");
  const [campaignFilter, setCampaignFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");

  const domainMap = useMemo(() => indexBy(domains.data ?? [], (d) => d.id), [domains.data]);
  const campaignMap = useMemo(() => indexBy(campaigns.data ?? [], (c) => c.id), [campaigns.data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (links.data ?? []).filter((l) => {
      if (domainFilter && String(l.domainId) !== domainFilter) return false;
      if (campaignFilter === "none" && l.campaignId !== null) return false;
      if (campaignFilter && campaignFilter !== "none" && String(l.campaignId) !== campaignFilter) return false;
      if (statusFilter === "on" && !l.enabled) return false;
      if (statusFilter === "off" && l.enabled) return false;
      if (q) {
        const host = domainMap.get(l.domainId)?.hostname ?? "";
        if (!`${host}${l.path} ${l.targetUrl}`.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [links.data, domainFilter, campaignFilter, statusFilter, search, domainMap]);

  const remove = useMutation(
    orpc.links.delete.mutationOptions({
      onSuccess: async () => {
        await invalidate(orpc.links.key());
        notify("Link removed.");
        setConfirmId(null);
      },
      onError: (err) => notify(toMessage(err), "error"),
    }),
  );
  const update = useMutation(
    orpc.links.update.mutationOptions({
      onSuccess: async () => invalidate(orpc.links.key()),
      onError: (err) => notify(toMessage(err), "error"),
    }),
  );

  const noDomains = (domains.data?.length ?? 0) === 0;
  const isLoading = links.isPending || domains.isPending || campaigns.isPending;

  return (
    <div className="stack">
      <div className="page__header">
        <div>
          <h1 className="page__title">Links</h1>
          <p className="page__subtitle">Each link forwards a short web address to wherever you choose.</p>
        </div>
        {editable && !noDomains && (
          <div className="page__actions">
            <Button variant="primary" onClick={() => setEditing("new")}>
              New link
            </Button>
          </div>
        )}
      </div>

      {isLoading ? (
        <LoadingScreen />
      ) : links.isError ? (
        <ErrorBanner message={toMessage(links.error)} />
      ) : noDomains ? (
        <div className="card card--pad">
          <EmptyState
            icon="🌐"
            title="Add a web address first"
            text="A link needs a web address to live on. Add one, then come back to create links."
            action={
              editable ? (
                <Link href="/domains" className="btn btn--primary">
                  Add a web address
                </Link>
              ) : undefined
            }
          />
        </div>
      ) : links.data.length === 0 ? (
        <div className="card card--pad">
          <EmptyState
            title="No links yet"
            text="Create your first link to start sending visitors where you want."
            action={
              editable ? (
                <Button variant="primary" onClick={() => setEditing("new")}>
                  Create your first link
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <>
          <LinkFilters
            domains={domains.data ?? []}
            campaigns={campaigns.data ?? []}
            domainFilter={domainFilter}
            setDomainFilter={setDomainFilter}
            campaignFilter={campaignFilter}
            setCampaignFilter={setCampaignFilter}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            search={search}
            setSearch={setSearch}
            shown={filtered.length}
            total={links.data.length}
          />
          {filtered.length === 0 ? (
            <div className="card card--pad">
              <EmptyState icon="🔍" title="No links match your filters" text="Try changing or clearing the filters above." />
            </div>
          ) : (
            <div className="card">
              <div className="rows">
                {filtered.map((link) => (
                  <LinkRow
                    key={link.id}
                    link={link}
                    hostname={domainMap.get(link.domainId)?.hostname ?? "(unknown)"}
                    campaignName={link.campaignId ? campaignMap.get(link.campaignId)?.name : undefined}
                    editable={editable}
                    togglePending={update.isPending}
                    onToggle={() => update.mutate({ id: link.id, enabled: !link.enabled })}
                    onEdit={() => setEditing(link)}
                    onDelete={() => setConfirmId(link.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {editing && (
        <LinkModal
          link={editing === "new" ? null : editing}
          domains={domains.data ?? []}
          campaigns={campaigns.data ?? []}
          onClose={() => setEditing(null)}
        />
      )}
      {confirmId !== null && (
        <ConfirmDialog
          title="Delete this link?"
          message="Visitors using this link will see a 'not found' page. Past click stats are kept. This cannot be undone."
          busy={remove.isPending}
          onConfirm={() => remove.mutate({ id: confirmId })}
          onCancel={() => setConfirmId(null)}
        />
      )}
    </div>
  );
}

function LinkRow({
  link,
  hostname,
  campaignName,
  editable,
  togglePending,
  onToggle,
  onEdit,
  onDelete,
}: {
  link: LinkDto;
  hostname: string;
  campaignName?: string;
  editable: boolean;
  togglePending: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="row">
      <div className="row__main">
        <Link href={`/links/${link.id}`} className="row__link mono">
          {hostname}
          {link.path === "/" ? "" : link.path}
        </Link>
        <div className="row__sub">
          goes to {link.targetUrl}
          {campaignName && ` · ${campaignName}`}
        </div>
      </div>
      <Badge tone="muted">{link.redirectType}</Badge>
      {link.enabled ? <Badge tone="ok">On</Badge> : <Badge tone="muted">Off</Badge>}
      {editable && (
        <div className="row__actions">
          <Button size="sm" disabled={togglePending} onClick={onToggle}>
            {link.enabled ? "Turn off" : "Turn on"}
          </Button>
          <Button size="sm" onClick={onEdit}>
            Edit
          </Button>
          <Button size="sm" variant="danger" onClick={onDelete}>
            Delete
          </Button>
        </div>
      )}
    </div>
  );
}

function LinkModal({
  link,
  domains,
  campaigns,
  onClose,
}: {
  link: LinkDto | null;
  domains: DomainDto[];
  campaigns: CampaignDto[];
  onClose: () => void;
}) {
  const invalidate = useInvalidate();
  const { notify } = useToast();
  const [domainId, setDomainId] = useState<number>(link?.domainId ?? domains[0]?.id ?? 0);
  const [path, setPath] = useState(link?.path ?? "/");
  const [targetUrl, setTargetUrl] = useState(link?.targetUrl ?? "");
  const [redirectType, setRedirectType] = useState<RedirectType>(link?.redirectType ?? 301);
  const [campaignId, setCampaignId] = useState<string>(link?.campaignId ? String(link.campaignId) : "");
  const [params, setParams] = useState<QueryParam[]>(link?.queryParams ?? []);
  const [enabled, setEnabled] = useState<boolean>(link?.enabled ?? true);
  const [fallbackUrl, setFallbackUrl] = useState(link?.fallbackUrl ?? "");
  const [forwardQuery, setForwardQuery] = useState<boolean>(link?.forwardQuery ?? false);
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);

  const onError = (err: unknown) => setErrors(toFormErrors(err));
  const onSuccess = async () => {
    await invalidate(orpc.links.key());
    notify(link ? "Link saved." : "Link created.");
    onClose();
  };
  const create = useMutation(orpc.links.create.mutationOptions({ onSuccess, onError }));
  const update = useMutation(orpc.links.update.mutationOptions({ onSuccess, onError }));
  const busy = create.isPending || update.isPending;

  const submit = () => {
    const shared = {
      path,
      targetUrl,
      redirectType,
      queryParams: params,
      campaignId: campaignId ? Number(campaignId) : null,
      enabled,
      fallbackUrl: fallbackUrl || null,
      forwardQuery,
    };
    if (link) update.mutate({ id: link.id, ...shared });
    else create.mutate({ domainId, ...shared });
  };

  const selectedHost = domains.find((d) => d.id === domainId)?.hostname ?? "";

  return (
    <Modal
      title={link ? "Edit link" : "New link"}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={busy}>
            {busy ? "Saving..." : "Save link"}
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

        {link ? (
          <Field label="Web address">
            <Input value={selectedHost} disabled readOnly />
          </Field>
        ) : (
          <Field label="Web address" htmlFor="domainId" error={errors.fields.domainId}>
            <Select
              id="domainId"
              value={String(domainId)}
              invalid={Boolean(errors.fields.domainId)}
              onValueChange={(v) => setDomainId(Number(v))}
              options={domains.map((d) => ({ value: String(d.id), label: d.hostname }))}
            />
          </Field>
        )}

        <Field label="Path" htmlFor="path" hint='The part after the web address. Use "/" for the main link.' error={errors.fields.path}>
          <Input id="path" value={path} invalid={Boolean(errors.fields.path)} placeholder="/offer" onChange={(e) => setPath(e.target.value)} />
        </Field>

        <Field
          label="Send visitor to"
          htmlFor="targetUrl"
          hint="The full web address visitors should land on."
          error={errors.fields.targetUrl}
        >
          <Input
            id="targetUrl"
            value={targetUrl}
            invalid={Boolean(errors.fields.targetUrl)}
            placeholder="https://example.com/welcome"
            onChange={(e) => setTargetUrl(e.target.value)}
          />
        </Field>

        <Field label="Redirect type" htmlFor="redirectType" error={errors.fields.redirectType}>
          <Select
            id="redirectType"
            value={String(redirectType)}
            onValueChange={(v) => setRedirectType(asRedirectType(Number(v)))}
            options={REDIRECT_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))}
          />
        </Field>

        <Field label="Campaign" htmlFor="campaignId" hint="Optional. Fills in tracking tags automatically.">
          <Select
            id="campaignId"
            value={campaignId || "none"}
            onValueChange={(v) => setCampaignId(v === "none" ? "" : v)}
            options={[
              { value: "none", label: "No campaign" },
              ...campaigns.map((c) => ({ value: String(c.id), label: c.name })),
            ]}
          />
        </Field>

        <Field label="Extra options added to the address" hint="Optional name/value pairs appended to the link.">
          <ParamsEditor params={params} onChange={setParams} />
        </Field>

        <Field label="If turned off, send visitors here" htmlFor="fallbackUrl" hint="Optional. Leave blank to show a 'not found' page." error={errors.fields.fallbackUrl}>
          <Input
            id="fallbackUrl"
            value={fallbackUrl}
            invalid={Boolean(errors.fields.fallbackUrl)}
            placeholder="https://example.com/closed"
            onChange={(e) => setFallbackUrl(e.target.value)}
          />
        </Field>

        <div>
          <div className="cluster">
            <Switch id="forwardQuery" checked={forwardQuery} onCheckedChange={setForwardQuery} />
            <label htmlFor="forwardQuery">Forward incoming query parameters</label>
          </div>
          <p className="field__hint">
            Pass options from the incoming link through to the destination. Your configured options always take priority.
          </p>
        </div>

        <div className="cluster">
          <Switch id="enabled" checked={enabled} onCheckedChange={setEnabled} />
          <label htmlFor="enabled">Link is on</label>
        </div>

        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

function ParamsEditor({ params, onChange }: { params: QueryParam[]; onChange: (params: QueryParam[]) => void }) {
  return (
    <div className="params-editor">
      {params.map((p, i) => (
        <div className="param-row" key={i}>
          <Input
            placeholder="name"
            value={p.key}
            onChange={(e) => onChange(params.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))}
          />
          <Input
            placeholder="value"
            value={p.value}
            onChange={(e) => onChange(params.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
          />
          <Button size="sm" aria-label="Remove option" onClick={() => onChange(params.filter((_, j) => j !== i))}>
            &times;
          </Button>
        </div>
      ))}
      <Button size="sm" onClick={() => onChange([...params, { key: "", value: "" }])}>
        + Add option
      </Button>
    </div>
  );
}

function LinkFilters({
  domains,
  campaigns,
  domainFilter,
  setDomainFilter,
  campaignFilter,
  setCampaignFilter,
  statusFilter,
  setStatusFilter,
  search,
  setSearch,
  shown,
  total,
}: {
  domains: DomainDto[];
  campaigns: CampaignDto[];
  domainFilter: string;
  setDomainFilter: (v: string) => void;
  campaignFilter: string;
  setCampaignFilter: (v: string) => void;
  statusFilter: string;
  setStatusFilter: (v: string) => void;
  search: string;
  setSearch: (v: string) => void;
  shown: number;
  total: number;
}) {
  const anyFilter = Boolean(domainFilter || campaignFilter || statusFilter || search.trim());
  const clear = () => {
    setDomainFilter("");
    setCampaignFilter("");
    setStatusFilter("");
    setSearch("");
  };
  return (
    <div className="card card--pad filters">
      <div className="filters__control">
        <Select
          ariaLabel="Filter by web address"
          value={domainFilter || "all"}
          onValueChange={(v) => setDomainFilter(v === "all" ? "" : v)}
          options={[
            { value: "all", label: "All web addresses" },
            ...domains.map((d) => ({ value: String(d.id), label: d.hostname })),
          ]}
        />
      </div>
      <div className="filters__control">
        <Select
          ariaLabel="Filter by campaign"
          value={campaignFilter || "all"}
          onValueChange={(v) => setCampaignFilter(v === "all" ? "" : v)}
          options={[
            { value: "all", label: "All campaigns" },
            { value: "none", label: "No campaign" },
            ...campaigns.map((c) => ({ value: String(c.id), label: c.name })),
          ]}
        />
      </div>
      <div className="filters__control">
        <Select
          ariaLabel="Filter by status"
          value={statusFilter || "any"}
          onValueChange={(v) => setStatusFilter(v === "any" ? "" : v)}
          options={[
            { value: "any", label: "Any status" },
            { value: "on", label: "On" },
            { value: "off", label: "Off" },
          ]}
        />
      </div>
      <div className="filters__control filters__control--grow">
        <Input placeholder="Search path or destination" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <span className="muted filters__count">
        {shown} of {total}
      </span>
      {anyFilter && (
        <Button size="sm" variant="ghost" onClick={clear}>
          Clear
        </Button>
      )}
    </div>
  );
}

function indexBy<T>(items: T[], key: (item: T) => number): Map<number, T> {
  return new Map(items.map((item) => [key(item), item]));
}
