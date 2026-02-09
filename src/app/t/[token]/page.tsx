import TrackClient from "./TrackClient";

type PageProps = { params: Promise<{ token: string }> };

export default async function TrackPage(props: PageProps) {
  const { token } = await props.params;

  return <TrackClient token={token} />;
}
