// pattern: Imperative Shell
import type { APIRoute } from "astro";

import { getStandardSitePublicationUri } from "../../site-config.ts";

type Props = {
  readonly publicationUri: string;
};

/**
 * Standard.site discovery uses the verified publication DID by default. An
 * explicit empty PUBLIC_STANDARD_SITE_DID disables publishing (useful for a
 * migration), and returning no paths keeps that endpoint physically absent
 * from the static deployment.
 */
export function getStaticPaths() {
  const publicationUri = getStandardSitePublicationUri();

  return publicationUri === null
    ? []
    : [
        {
          params: { publication: "site.standard.publication" },
          props: { publicationUri },
        },
      ];
}

export const GET: APIRoute = ({ props }) => {
  const { publicationUri } = props as Props;

  return new Response(`${publicationUri}\n`, {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
};
