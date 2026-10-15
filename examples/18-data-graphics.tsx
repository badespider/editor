import { DataBars, TrendLine, MetricCard } from "@diffusionstudio/jsx";

/** Three illustrative data presentations. Values are authored fixtures, not measurements. */
export default function DataGraphicsExample() {
  return (
    <rect scene="data-graphics-example" width={1920} height={1080} start={0} end={24} fill="#101C2B">
      <DataBars title="Change by team" start={0} duration={8}
        baseline={0} valueDomain={[-10, 10]} unit="hours"
        data={[{ label: "A", value: -4 }, { label: "B", value: 8 }, { label: "C", value: 0 }]}
        disclosure={{ kind: "illustrative", text: "Authored comparison" }} />
      <TrendLine title="Supplied points" start={8} duration={8}
        xDomain={[0, 4]} yDomain={[-10, 10]}
        xLabel="Time" xUnit="s" yLabel="Count" yUnit="items"
        points={[{ x: 0, y: -4 }, { x: 1, y: 2 }, null, { x: 3, y: 4 }, { x: 4, y: 8 }]}
        disclosure={{ kind: "illustrative", text: "Gap is intentional" }} />
      <MetricCard title="Duration" value={24} unit="h" start={16} duration={8}
        comparison={{ label: "Previous period", value: 30 }}
        disclosure={{ kind: "illustrative", text: "Authored comparison" }} />
    </rect>
  );
}
