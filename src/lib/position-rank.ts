const seniority = [
  /executive chef|exec chef/i,
  /head chef|chef de cuisine/i,
  /exec(utive)? sous/i,
  /^(?!.*(jnr|junior)).*sous chef/i,
  /(jnr|junior) sous/i,
  /pastry chef/i,
  /sushi chef/i,
  /(snr|senior) (chef de partie|cdp)/i,
  /chef de partie|\bcdp\b/i,
  /(jnr|junior) (chef de partie|cdp)/i,
  /demi chef/i,
  /commis (1|i)\b/i,
  /commis (2|ii)\b/i,
  /commis (3|iii)\b/i,
  /commis/i,
  /trainee/i,
  /goods[\s-]*in/i,
  /head steward/i,
  /steward|kitchen porter/i,
];

/** Kitchen seniority, lower is more senior; unknown positions sit after trainees. */
export function positionRank(position: string) {
  const index = seniority.findIndex((pattern) => pattern.test(position));
  return index === -1 ? seniority.length - 3.5 : index;
}
