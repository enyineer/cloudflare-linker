import { useMutation, useQuery } from "@tanstack/react-query";
import { toMessage } from "../lib/errors.ts";
import { useInvalidate } from "../lib/mutations.ts";
import { orpc } from "../orpc.ts";
import { CLOUDFLARE_ADD_SITE_URL, registrableDomain } from "../../shared/cloudflare-link.ts";
import { Button } from "./Button.tsx";
import { EmptyState } from "./EmptyState.tsx";
import { Modal } from "./Modal.tsx";
import { useToast } from "./Toast.tsx";

const STEP_ICON = { dns: "🌐", route: "🔗" } as const;

/** Shows what setting up a hostname on Cloudflare would change, and only makes
 *  the change once the operator confirms. Reused by Web addresses + Setup. */
export function SetupConfirmDialog({ hostname, onClose }: { hostname: string; onClose: () => void }) {
  const invalidate = useInvalidate();
  const { notify } = useToast();
  const plan = useQuery(orpc.setup.previewHostname.queryOptions({ input: { hostname } }));

  const apply = useMutation(
    orpc.setup.setupHostname.mutationOptions({
      onSuccess: async (res) => {
        if (res.ok) {
          await invalidate(orpc.domains.key());
          await invalidate(orpc.setup.key());
          notify(res.message);
          onClose();
        } else {
          notify(res.message, "error");
        }
      },
      onError: (err) => notify(toMessage(err), "error"),
    }),
  );

  const data = plan.data;
  const canApply = Boolean(data?.ok && !data.alreadyDone);

  return (
    <Modal
      title={`Set up ${hostname}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={apply.isPending}>
            {canApply ? "Cancel" : "Close"}
          </Button>
          {canApply && (
            <Button variant="primary" onClick={() => apply.mutate({ hostname })} disabled={apply.isPending}>
              {apply.isPending ? "Setting up..." : "Confirm"}
            </Button>
          )}
        </>
      }
    >
      {plan.isPending ? (
        <p className="muted">Checking what's needed...</p>
      ) : plan.isError ? (
        <EmptyState icon="⚠️" title="Couldn't check" text={toMessage(plan.error)} />
      ) : !data ? null : data.code === "zone_not_found" ? (
        <EmptyState
          icon="🌐"
          title={`Add ${registrableDomain(hostname)} to Cloudflare`}
          text={`${hostname} isn't on your Cloudflare account yet. Add it as a domain, then come back and set it up for your links.`}
          action={
            <>
              <a className="btn btn--primary" href={CLOUDFLARE_ADD_SITE_URL} target="_blank" rel="noreferrer">
                Add a domain to Cloudflare
              </a>
              <p className="empty__note">
                On the next page, enter <strong>{registrableDomain(hostname)}</strong> (Cloudflare can't fill it in).
                This points the domain's nameservers to Cloudflare at your registrar, so it is not instant - once it
                shows active, return here and press Set up.
              </p>
            </>
          }
        />
      ) : data.alreadyDone ? (
        <EmptyState icon="✅" title="Already set up" text={data.message} />
      ) : !data.ok ? (
        <EmptyState icon="⚠️" title="Can't set this up yet" text={data.message} />
      ) : (
        <div className="stack">
          {data.message && <p className="muted">{data.message}</p>}
          <div className="plan">
            {data.steps.map((s) => (
              <div className="plan-step" key={s.text}>
                <span className="plan-step__icon" aria-hidden="true">
                  {STEP_ICON[s.icon]}
                </span>
                <span className="plan-step__text">{s.text}</span>
              </div>
            ))}
          </div>
          {data.warning && (
            <p className="plan-warn">
              <span aria-hidden="true">⚠ </span>
              {data.warning}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
