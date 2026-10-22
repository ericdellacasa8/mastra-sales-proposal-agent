// Fictional acceptance scenario; no private Studio records copied here.
export const flowMessage = 'I run FlowSync, a SaaS company providing workflow automation software for businesses. FlowSync Standard: $29 per user per month. Includes workflow automation, task management, and reporting. FlowSync Enterprise: $59 per user per month. Includes everything in Standard, plus advanced integrations, custom permissions, and priority support. I need a proposal for Northstar Logistics, a logistics company looking to automate internal operations across several departments. They want 30 Enterprise licenses and 10 Standard licenses. Their main priorities are reducing manual processes, improving operational visibility, and coordinating workflows between teams. Please generate a professional sales proposal with a clear breakdown of pricing and the expected benefits.';
const fact=(value:string,quote=value)=>({value,quote});
export const flowChanges=[
 {action:'start',mode:'custom'},
 {action:'seller',fields:[{field:'name',...fact('FlowSync')}]},
 ...[['standard','FlowSync Standard','29'],['enterprise','FlowSync Enterprise','59']].map(([id,name,price])=>({action:'product',id,name:fact(name!),price:fact(price!,`$${price} per user per month`),billing:fact('monthly','per user per month')})),
 {action:'customer',fields:[{field:'company',...fact('Northstar Logistics')}]},
 // Actual failing notes shape observed in persisted live tool calls.
 {action:'notes',text:'Request: 30 Enterprise licenses and 10 Standard licenses. Priorities: reducing manual processes, improving operational visibility, and coordinating workflows between teams.'},
 {action:'select',productId:'enterprise',quantity:30,quote:'30 Enterprise licenses'},
 {action:'select',productId:'standard',quantity:10,quote:'10 Standard licenses'},
];
export const flowDraft={headline:'Workflow software for Northstar Logistics',summary:'FlowSync software for the requested teams.',needs:[{text:'Coordinate workflows between teams.',evidenceQuote:'coordinating workflows between teams'}],recommendations:[{productId:'enterprise',quantity:30,rationale:'Enterprise licenses for the requested scope.',evidenceQuote:'30 Enterprise licenses'},{productId:'standard',quantity:10,rationale:'Standard licenses for the requested scope.',evidenceQuote:'10 Standard licenses'}],timeline:[],assumptions:[],openQuestions:[],nextStep:'Review the proposed scope with your team.'};
