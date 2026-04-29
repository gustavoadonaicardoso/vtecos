import { NextResponse } from 'next/server';
import { updateLeadInDb, deleteLeadFromDb, moveLeadToStage } from '@/services/leads.service';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const resolvedParams = await params;
    const leadId = resolvedParams.id;
    const body = await request.json();
    const { action, ...updates } = body;

    // Ação especial: Mover para estágio
    if (action === 'move_stage' && updates.stageId) {
      const result = await moveLeadToStage(leadId, updates.stageId);
      if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json({ success: true }, { status: 200 });
    }

    // Ação normal: Update campos
    const result = await updateLeadInDb(leadId, updates);
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
    
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const resolvedParams = await params;
    const leadId = resolvedParams.id;
    const result = await deleteLeadFromDb(leadId);
    
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
    
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
