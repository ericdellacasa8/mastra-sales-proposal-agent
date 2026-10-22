export const acmeMessage='I run Acme Projects, a software company selling project management software for $25 per user per month. We also offer onboarding for a one-time fee of $500. Create a proposal for Brightside Technologies. They need 20 licenses and onboarding support. Their priority is coordinating projects across multiple teams.';
const fact=(value:string,quote=value)=>({value,quote});
export const acmeChanges=[
 {action:'start',mode:'custom'},
 {action:'seller',fields:[{field:'name',...fact('Acme Projects')}]},
 {action:'product',id:'licenses',name:fact('project management software'),price:fact('25','$25'),billing:{value:'monthly',quote:'per month'}},
 {action:'product',id:'onboarding',name:fact('onboarding'),price:fact('500','$500'),billing:{value:'once',quote:'one-time'}},
 {action:'customer',fields:[{field:'company',...fact('Brightside Technologies')}]},
 {action:'notes',text:'Their priority is coordinating projects across multiple teams.'},
 {action:'select',productId:'licenses',quantity:20,quote:'They need 20 licenses'},
 {action:'select',productId:'onboarding',quote:'onboarding support'},
];
export const acmeDraft={
 headline:'A project management proposal for Brightside Technologies',
 summary:'Project management software and onboarding for Brightside Technologies.',
 needs:[{text:'Coordinating projects across multiple teams.',evidenceQuote:'Their priority is coordinating projects across multiple teams.'}],
 recommendations:[{productId:'licenses',quantity:20,rationale:'Project management software for the requested licenses.',evidenceQuote:'They need 20 licenses'},
 {productId:'onboarding',quantity:1,rationale:'The requested onboarding support.',evidenceQuote:'1 onboarding package.'}],
 timeline:[],assumptions:[],openQuestions:[],nextStep:'Review the proposed scope with your team.',
};
