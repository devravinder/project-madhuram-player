import { Footer, Layout, Main } from "@/components/Elements";
import FooterContent from "./FooterContent";
import MainContent from "./MainContent";

export default function AppLayout() {
  return (
    <Layout>
      <Main>
        <MainContent />
      </Main>
      <Footer>
        <FooterContent />
      </Footer>
    </Layout>
  );
}
