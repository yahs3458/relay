import type { Metadata } from "next";
import Workspace from "./Workspace";

export const metadata: Metadata = { title: "Relay workspace — live demo" };

export default function AppPage() {
  return <Workspace />;
}
