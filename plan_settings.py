from datetime import date

DEFAULT_SETTINGS = {
    'calorie_goal': 0, 'protein_goal': 0, 'carbs_goal': 0, 'fat_goal': 0,
    'diet_guidance': '', 'workout_guidance':'', 'cardio_text': '', 'cardio_minutes': 0,
    'activities': [], 'daily_goals': [], 'sugar_enabled': True, 'sugar_days': 120,
    'program_weeks': 12, 'program_start': '', 'program_title': 'Meu programa',
    'target_weight': 0, 'schedule': ['CARDIO'] * 7,
}


def validate_settings(data):
    if not isinstance(data, dict):
        raise ValueError('Configurações inválidas.')
    out = {**DEFAULT_SETTINGS, **data}
    for key, minimum, maximum in [('calorie_goal',0,10000),('protein_goal',0,1000),('carbs_goal',0,1000),('fat_goal',0,1000),('cardio_minutes',0,300),('sugar_days',1,730),('program_weeks',1,104)]:
        if type(out[key]) is not int or not minimum <= out[key] <= maximum:
            raise ValueError('Valor inválido: '+key)
    for key, limit in [('diet_guidance',4000),('workout_guidance',4000),('cardio_text',4000),('program_title',120),('program_start',10)]:
        if not isinstance(out[key],str) or len(out[key])>limit:
            raise ValueError('Campo inválido: '+key)
        out[key]=out[key].strip()
    if out['program_start']:
        try:
            if date.fromisoformat(out['program_start']).isoformat()!=out['program_start']: raise ValueError()
        except ValueError:
            raise ValueError('Data de início inválida.')
    if type(out['target_weight']) not in (int,float) or not 0<=out['target_weight']<=500:
        raise ValueError('Meta de peso inválida.')
    if type(out['sugar_enabled']) is not bool:
        raise ValueError('Configuração de açúcar inválida.')
    for key in ('activities','daily_goals'):
        if not isinstance(out[key],list) or len(out[key])>20 or any(not isinstance(s,str) or not s.strip() or len(s)>200 for s in out[key]):
            raise ValueError('Lista inválida: '+key)
        out[key]=[s.strip() for s in out[key]]
    if not isinstance(out['schedule'],list) or len(out['schedule'])!=7 or any(s not in ['CARDIO']+list('ABCDEFGHIJKLMNOPQRSTUVWXYZ') for s in out['schedule']):
        raise ValueError('Distribuição semanal inválida.')
    return {key:out[key] for key in DEFAULT_SETTINGS}
