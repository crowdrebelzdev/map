"use client";

import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { sendBroadcast } from "@/actions/broadcasts";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const EVERYONE_VALUE = "__everyone__";

export function BroadcastDialog({
  eventId,
  eventSlug,
  recipients,
}: {
  eventId: string;
  eventSlug: string;
  recipients: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [recipientId, setRecipientId] = useState(EVERYONE_VALUE);
  const [sending, setSending] = useState(false);

  async function handleSend() {
    if (!message.trim()) return;
    setSending(true);
    try {
      const targetId = recipientId === EVERYONE_VALUE ? null : recipientId;
      await sendBroadcast(eventId, eventSlug, message, targetId);
      const targetName = targetId ? recipients.find((r) => r.id === targetId)?.name : null;
      toast.success(targetName ? `Bericht verstuurd naar ${targetName}.` : "Bericht verstuurd naar iedereen op de kaart.");
      setMessage("");
      setRecipientId(EVERYONE_VALUE);
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Versturen mislukt.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="secondary" size="sm" className="gap-1.5" />}>
        <MessageSquare size={15} />
        Bericht sturen
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bericht sturen</DialogTitle>
          <DialogDescription>
            Verschijnt direct als melding bij de ontvanger(s) en blijft zichtbaar bij "Berichten".
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {recipients.length > 0 && (
            <div className="space-y-1">
              <Label htmlFor="broadcast-recipient">Naar</Label>
              <Select value={recipientId} onValueChange={(v) => setRecipientId(v ?? EVERYONE_VALUE)}>
                <SelectTrigger id="broadcast-recipient" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={EVERYONE_VALUE}>Iedereen op de kaart</SelectItem>
                  {recipients.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <Textarea
            placeholder="Bijv. 'Iedereen naar sector C i.v.m. drukte.'"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={300}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={sending}>
            Annuleren
          </Button>
          <Button onClick={handleSend} disabled={sending || !message.trim()}>
            {sending ? "Bezig..." : "Versturen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
