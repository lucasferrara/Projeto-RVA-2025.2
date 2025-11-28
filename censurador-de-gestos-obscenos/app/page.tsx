import dynamic from "next/dynamic";

const ObsceneGestureCensor = dynamic(() => import("./components/ObsceneGestureCensor"), {
  ssr: false,
  loading: () => <p>Loading Censor App...</p>,
});

export default function Home() {
  return (
    <main>
      <ObsceneGestureCensor />
    </main>
  );
}
