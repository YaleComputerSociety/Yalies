/**
 * Validate a CAS ticket and return the associated netId.
 */
export const validateCASTicket = async (
  ticket: string,
  service: string
): Promise<string> => {
  const url = new URL("https://secure.its.yale.edu/cas/serviceValidate");
  url.searchParams.set("ticket", ticket);
  url.searchParams.set("service", service);

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`CAS validation failed with status ${response.status}`);
  }

  const body = await response.text();
  const match = body.match(/<cas:user>([^<]+)<\/cas:user>/);
  if (!match) {
    throw new Error("CAS validation did not return a user");
  }

  return match[1];
};
