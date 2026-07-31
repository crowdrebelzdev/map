import { Settings } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";

export default function PlatformSettingsPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Platform-instellingen</CardTitle>
      </CardHeader>
      <CardContent>
        <Empty className="border-0 p-0">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Settings />
            </EmptyMedia>
            <EmptyTitle>Nog geen platform-instellingen</EmptyTitle>
            <EmptyDescription>
              Er is op dit moment geen platform-brede configuratie om hier te tonen. Deze pagina
              staat klaar voor zodra dat verandert.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </CardContent>
    </Card>
  );
}
