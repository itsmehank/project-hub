export function GridBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_at_top,black_15%,transparent_70%)]" />
      <div className="absolute top-[-280px] left-1/2 h-[520px] w-[960px] -translate-x-1/2 rounded-full bg-accent/15 blur-[120px]" />
      <div className="absolute top-[-200px] left-[65%] h-[320px] w-[480px] rounded-full bg-accent2/10 blur-[120px]" />
    </div>
  );
}
