import { memo, useMemo } from "react";
import { GitBranch, FileCode, Package } from "@phosphor-icons/react";
import { sdkInfo } from "../data/sdkInfo";
import { GitHubLogo, SlackLogo, CodeLogos } from "./CodeLogos";

const SLACK_URL =
  "https://join.slack.com/t/growthbookusers/shared_invite/zt-2xw8fu279-Y~hwnfCEf7WrEI9qScHURQ";

// Add display name to InfoContainer
const InfoContainer = memo(
  ({
    href,
    icon,
    children,
  }: {
    href?: string;
    icon: React.ReactNode;
    children: React.ReactNode;
  }) => {
    const Component = href ? "a" : "div";
    const props = href ? { href, target: "_blank", rel: "noreferrer" } : {};

    return (
      <Component className="sdk-info-container" {...props}>
        {icon}
        {children}
      </Component>
    );
  }
);
InfoContainer.displayName = "InfoContainer";

// Add display name to main component
export default function SdkResources({ sdk }: { sdk: keyof typeof sdkInfo }) {
  const { name, version, github, examples, packageRepos } = sdkInfo[sdk];
  const formattedVersion = useMemo(() => version.replace(/^v?/, "v"), [
    version,
  ]);

  const githubName = useMemo(() => github.split("/").pop(), [github]);

  return (
    <section className="sdk-info">
      <header>
        <div>
          <CodeLogos name={sdk} />
          <span>{name} Resources</span>
        </div>
        <InfoContainer icon={<GitBranch size={32} />}>
          {formattedVersion}
        </InfoContainer>
      </header>

      <InfoContainer href={github} icon={<GitHubLogo />}>
        {githubName}
      </InfoContainer>

      {packageRepos.map((repo) => (
        <InfoContainer
          key={repo.name}
          href={repo.url}
          icon={<Package size={32} />}
        >
          {repo.name}
        </InfoContainer>
      ))}

      {examples.map(({ url, name }) => (
        <InfoContainer key={name} href={url} icon={<FileCode size={32} />}>
          {name}
        </InfoContainer>
      ))}

      <InfoContainer href={SLACK_URL} icon={<SlackLogo />}>
        Get help on Slack
      </InfoContainer>
    </section>
  );
}

SdkResources.displayName = "SDK Resources";
