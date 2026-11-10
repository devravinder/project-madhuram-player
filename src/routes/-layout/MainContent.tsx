import { Outlet } from "@tanstack/react-router";
import { MainContainer, MainSection } from "@/components/Elements";
import Player from "@/components/player/Player";

export default function MainContent() {
  return (
    <MainContainer>
      <MainSection>
        <Outlet />
      </MainSection>
      <Player />
    </MainContainer>
  );
}
